const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqWBjicIArLMAskM3y_G3MxxQgl38CoSsfUNAt2ckVHc5yO881VuyM0h6cGqovCXk5/exec";
const ROSTER_KEY = "prostage_roster_juani_2026";
const QUEUE_KEY = "prostage_ingresos_pendientes_juani_2026";
const CHANNEL_NAME = "prostage_qr";

const pantallaHome = document.getElementById("pantallaHome");
const pantallaMesa = document.getElementById("pantallaMesa");
const homeVideo = document.getElementById("homeVideo");
const videoMesa = document.getElementById("videoMesa");
const estado = document.getElementById("estado");

let escaneando = false;
let sistemaIniciado = false;
let timeoutVideo = null;
let procesandoCola = false;
let timerReintento = null;
const canal = new BroadcastChannel(CHANNEL_NAME);

homeVideo.src = "./videos/HomeAlma.mp4";
homeVideo.loop = true;
homeVideo.muted = true;

function leerRoster() {
  try {
    const data = JSON.parse(localStorage.getItem(ROSTER_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("No se pudo leer la lista local:", error);
    return [];
  }
}

function guardarRoster(roster) {
  localStorage.setItem(ROSTER_KEY, JSON.stringify(roster));
  canal.postMessage({ tipo: "CSV_ACTUALIZADO", cantidad: roster.length });
}

function leerCola() {
  try {
    const data = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("No se pudo leer la cola de sincronización:", error);
    return [];
  }
}

function guardarCola(cola) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
  avisarEstadoSync();
}

function avisarEstadoSync() {
  const pendientes = leerCola().length;
  canal.postMessage({ tipo: "SYNC_STATUS", pendientes });
}

function mostrarPantalla(pantalla) {
  document.querySelectorAll(".pantalla").forEach((p) => p.classList.remove("activa"));
  if (pantalla) pantalla.classList.add("activa");
}

function crearInicioRecepcion() {
  const fondo = document.createElement("div");
  Object.assign(fondo.style, {
    position: "fixed", inset: "0", background: "#000", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: "999999"
  });

  const boton = document.createElement("button");
  boton.textContent = "INICIAR RECEPCIÓN";
  Object.assign(boton.style, {
    padding: "22px 40px", fontSize: "24px", fontWeight: "bold",
    border: "0", borderRadius: "12px", cursor: "pointer"
  });
  fondo.appendChild(boton);
  document.body.appendChild(fondo);

  boton.addEventListener("click", async () => {
    try {
      homeVideo.muted = true;
      await homeVideo.play();
      sistemaIniciado = true;
      escaneando = true;
      estado.textContent = "Escaneá tu QR";
      fondo.remove();
      avisarEstadoSync();
      procesarCola();
      console.log("Recepción iniciada");
    } catch (error) {
      console.error("Error al iniciar:", error);
      estado.textContent = "No se pudo iniciar la recepción";
    }
  });
}

function onScanSuccess(decodedText) {
  if (!sistemaIniciado || !escaneando) return;
  const qrId = String(decodedText || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!qrId) return;

  escaneando = false;
  estado.textContent = "Validando QR...";
  console.log("QR recibido:", qrId);

  const invitadoLocal = leerRoster().find((row) => normalizarQr(row.qr_id) === qrId);
  if (invitadoLocal) {
    gestionarInvitadoLocal(invitadoLocal, qrId);
    return;
  }

  // Para altas recientes que todavía no están en el CSV local, consultar la nube.
  buscarInvitadoEnNube(qrId, (data) => {
    if (!data || !data.ok) {
      mostrarErrorYReanudar(data?.mensaje || "QR no encontrado");
      return;
    }
    reproducirVideoMesa(data, { sincronizarLocal: false });
  });
}

function normalizarQr(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function gestionarInvitadoLocal(invitado, qrId) {
  if (esIngresoRegistrado(invitado.ingreso)) {
    mostrarErrorYReanudar("QR ya utilizado", 5000);
    return;
  }
  if (invitado.mesa === "" || invitado.mesa == null) {
    mostrarErrorYReanudar("Mesa sin asignar", 5000);
    return;
  }
  reproducirVideoMesa({
    ...invitado,
    qr_id: qrId,
    ingreso: invitado.ingreso,
    mesa: invitado.mesa
  }, { sincronizarLocal: true });
}

function esIngresoRegistrado(value) {
  const ingreso = String(value || "").trim().toLowerCase();
  return ["sí", "si", "yes", "true", "1", "ingresó", "ingreso"].includes(ingreso);
}

function buscarInvitadoEnNube(qrId, callback) {
  pedirJsonp({ modo: "buscar", qr_id: qrId }, callback, () => {
    mostrarErrorYReanudar("Error al consultar QR");
  });
}

function pedirJsonp(params, callback, onError) {
  const callbackName = "recepcion_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const script = document.createElement("script");
  let terminado = false;
  const limpiar = () => {
    if (terminado) return;
    terminado = true;
    clearTimeout(timeout);
    script.remove();
    delete window[callbackName];
  };
  const timeout = setTimeout(() => {
    limpiar();
    onError?.();
  }, 12000);

  window[callbackName] = (data) => {
    limpiar();
    callback?.(data);
  };
  const query = new URLSearchParams({ ...params, callback: callbackName, _: Date.now() });
  script.src = `${SCRIPT_URL}?${query.toString()}`;
  script.onerror = () => {
    limpiar();
    onError?.();
  };
  document.body.appendChild(script);
}

function reproducirVideoMesa(data, options = {}) {
  const ingreso = String(data.ingreso || "").trim().toLowerCase();
  if (ingreso === "sí" || ingreso === "si") {
    mostrarErrorYReanudar("QR ya utilizado", 5000);
    return;
  }
  if (data.mesa === "" || data.mesa == null) {
    mostrarErrorYReanudar("Mesa sin asignar", 5000);
    return;
  }

  const mesa = String(data.mesa).trim();
  homeVideo.pause();
  videoMesa.pause();
  videoMesa.src = `./videos/Mesa${mesa}.mp4`;
  videoMesa.currentTime = 0;
  videoMesa.muted = false;
  videoMesa.volume = 1;
  mostrarPantalla(pantallaMesa);
  estado.textContent = `Mesa ${mesa}`;

  videoMesa.play().then(() => {
    console.log("VIDEO INICIADO CORRECTAMENTE");
    if (options.sincronizarLocal) registrarIngresoLocal(data);
    else marcarIngresoNube(data.qr_id);
  }).catch((error) => {
    console.error("NO SE PUDO REPRODUCIR:", error);
    estado.textContent = "Error al reproducir video";
    setTimeout(volverAlHome, 2500);
  });

  videoMesa.onended = volverAlHome;
  clearTimeout(timeoutVideo);
  timeoutVideo = setTimeout(volverAlHome, 15000);
}

function registrarIngresoLocal(data) {
  const qrId = normalizarQr(data.qr_id);
  const ahora = new Date().toISOString();
  const roster = leerRoster();
  const index = roster.findIndex((row) => normalizarQr(row.qr_id) === qrId);
  if (index >= 0) {
    roster[index] = { ...roster[index], ingreso: "Sí", horaIngreso: ahora };
    guardarRoster(roster);
  }

  const cola = leerCola();
  if (!cola.some((item) => normalizarQr(item.qr_id) === qrId)) {
    cola.push({ qr_id: qrId, intentos: 0, proximoIntento: 0 });
    guardarCola(cola);
  }
  canal.postMessage({
    tipo: "INGRESO_OK", qr: qrId, nombre: data.nombre,
    mesa: data.mesa, cantidad: data.cantidad, horaIngreso: ahora,
    sincronizado: false
  });
  procesarCola();
}

function marcarIngresoNube(qrId) {
  pedirJsonp({ modo: "ingreso", qr_id: qrId }, (data) => {
    if (data && data.ok) {
      canal.postMessage({ tipo: "INGRESO_OK", qr: qrId, nombre: data.nombre,
        mesa: data.mesa, cantidad: data.cantidad, horaIngreso: data.horaIngreso,
        sincronizado: true });
    } else {
      console.error("No se pudo registrar el ingreso en la nube:", data);
      canal.postMessage({ tipo: "SYNC_STATUS", error: "No se pudo sincronizar el ingreso" });
    }
  }, () => {
    canal.postMessage({ tipo: "SYNC_STATUS", error: "Sin conexión: el ingreso no llegó a la nube" });
  });
}

function procesarCola() {
  if (procesandoCola || !navigator.onLine) return;
  const cola = leerCola();
  const item = cola.find((entry) => Number(entry.proximoIntento || 0) <= Date.now());
  if (!item) {
    programarProximoIntento(cola);
    return;
  }

  procesandoCola = true;
  pedirJsonp({ modo: "ingreso", qr_id: item.qr_id }, (data) => {
    procesandoCola = false;
    const actual = leerCola();
    const remaining = actual.filter((entry) => normalizarQr(entry.qr_id) !== normalizarQr(item.qr_id));
    if (data && data.ok) {
      guardarCola(remaining);
      canal.postMessage({ tipo: "SYNC_CONFIRMADA", qr: item.qr_id });
    } else {
      console.error("Sincronización pendiente:", data);
      reintentar(item);
    }
    procesarCola();
  }, () => {
    procesandoCola = false;
    reintentar(item);
  });
}

function reintentar(item) {
  const cola = leerCola();
  const actual = cola.find((entry) => normalizarQr(entry.qr_id) === normalizarQr(item.qr_id));
  if (!actual) return;
  actual.intentos = Number(actual.intentos || 0) + 1;
  const demora = Math.min(60000, 3000 * (2 ** Math.min(actual.intentos - 1, 5)));
  actual.proximoIntento = Date.now() + demora;
  guardarCola(cola);
  programarProximoIntento(cola);
}

function programarProximoIntento(cola = leerCola()) {
  clearTimeout(timerReintento);
  if (!cola.length) return;
  const siguiente = Math.min(...cola.map((entry) => Number(entry.proximoIntento || 0)));
  timerReintento = setTimeout(procesarCola, Math.max(250, siguiente - Date.now()));
}

function mostrarErrorYReanudar(mensaje, demora = 4000) {
  estado.textContent = mensaje;
  setTimeout(() => {
    estado.textContent = "Escaneá tu QR";
    escaneando = true;
  }, demora);
}

function volverAlHome() {
  clearTimeout(timeoutVideo);
  videoMesa.pause();
  videoMesa.currentTime = 0;
  videoMesa.removeAttribute("src");
  videoMesa.load();
  mostrarPantalla(pantallaHome);
  homeVideo.muted = true;
  homeVideo.play().catch((error) => console.log("Home no pudo reproducirse:", error));
  estado.textContent = "Escaneá tu QR";
  escaneando = true;
}

canal.onmessage = (event) => {
  const data = event.data;
  if (!data) return;
  if (data.tipo === "QR" && data.codigo) onScanSuccess(data.codigo);
  if (data.tipo === "CSV_ACTUALIZADO") avisarEstadoSync();
};

window.addEventListener("online", procesarCola);
window.addEventListener("load", () => {
  mostrarPantalla(pantallaHome);
  estado.textContent = "Iniciá la recepción";
  avisarEstadoSync();
  crearInicioRecepcion();
});
