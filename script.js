// Apps Script que registra al invitado y envía el QR por email.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzqWBjicIArLMAskM3y_G3MxxQgl38CoSsfUNAt2ckVHc5yO881VuyM0h6cGqovCXk5/exec';
const FECHA_EVENTO = new Date('2026-12-05T21:00:00-03:00').getTime();

// Cuenta regresiva
const reloj = {
  days: document.getElementById('days'),
  hours: document.getElementById('hours'),
  minutes: document.getElementById('minutes'),
  seconds: document.getElementById('seconds')
};
function actualizarCuenta() {
  const restante = Math.max(0, FECHA_EVENTO - Date.now());
  const valores = {
    days: Math.floor(restante / 86400000),
    hours: Math.floor((restante % 86400000) / 3600000),
    minutes: Math.floor((restante % 3600000) / 60000),
    seconds: Math.floor((restante % 60000) / 1000)
  };
  Object.entries(reloj).forEach(([key, element]) => {
    if (element) element.textContent = String(valores[key]).padStart(2, '0');
  });
}
actualizarCuenta();
setInterval(actualizarCuenta, 1000);

// Dos carruseles independientes
function iniciarCarrusel(carrusel) {
  const track = carrusel.querySelector('.carousel__track');
  const slides = Array.from(carrusel.querySelectorAll('.carousel__slide'));
  const anterior = carrusel.querySelector('.carousel__arrow--prev');
  const siguiente = carrusel.querySelector('.carousel__arrow--next');
  const ventana = carrusel.querySelector('.carousel__window');
  const dots = carrusel.querySelector('.carousel__dots');
  if (!track || slides.length === 0 || !dots) return;

  let actual = 0;
  dots.replaceChildren();
  const botonesPunto = slides.map((_, indice) => {
    const punto = document.createElement('button');
    punto.type = 'button';
    punto.className = 'carousel__dot';
    punto.setAttribute('aria-label', `Mostrar foto ${indice + 1}`);
    punto.addEventListener('click', () => mostrar(indice));
    dots.appendChild(punto);
    return punto;
  });

  function mostrar(indice) {
    actual = (indice + slides.length) % slides.length;
    track.style.transform = `translateX(-${actual * 100}%)`;
    botonesPunto.forEach((punto, i) => {
      punto.classList.toggle('is-active', i === actual);
      punto.setAttribute('aria-current', i === actual ? 'true' : 'false');
    });
  }
  anterior?.addEventListener('click', () => mostrar(actual - 1));
  siguiente?.addEventListener('click', () => mostrar(actual + 1));

  // En celulares también permite pasar de foto con un gesto horizontal.
  let inicio = null;
  ventana?.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    inicio = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  ventana?.addEventListener('pointerup', event => {
    if (!inicio) return;
    const dx = event.clientX - inicio.x;
    const dy = event.clientY - inicio.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      mostrar(actual + (dx < 0 ? 1 : -1));
    }
    inicio = null;
  }, { passive: true });
  ventana?.addEventListener('pointercancel', () => { inicio = null; }, { passive: true });
  mostrar(0);
}
document.querySelectorAll('[data-carousel]').forEach(iniciarCarrusel);

// Copiar alias para regalo
const botonCopiar = document.getElementById('copyAlias');
const textoAlias = document.getElementById('aliasText');
const estadoCopia = document.getElementById('copyStatus');
botonCopiar?.addEventListener('click', async () => {
  const alias = textoAlias?.textContent.trim() || 'JUANIMAR.18';
  try {
    await navigator.clipboard.writeText(alias);
    estadoCopia.textContent = 'Alias copiado.';
  } catch (_) {
    const temporal = document.createElement('textarea');
    temporal.value = alias;
    temporal.setAttribute('readonly', '');
    temporal.style.position = 'fixed';
    temporal.style.opacity = '0';
    document.body.appendChild(temporal);
    temporal.select();
    const copiado = document.execCommand('copy');
    temporal.remove();
    estadoCopia.textContent = copiado ? 'Alias copiado.' : `Alias: ${alias}`;
  }
});

// Formulario de confirmación y recepción del QR
const modal = document.getElementById('qrModal');
const formulario = document.getElementById('qrForm');
const estado = document.getElementById('formStatus');
const botonEnviar = document.getElementById('submitQrForm');
let solicitudEnCurso = false;
let temporizadorSolicitud = null;

function abrirFormulario() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  formulario.elements.nombre.focus();
}
function cerrarFormulario() {
  if (solicitudEnCurso) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
document.querySelectorAll('[data-open-form]').forEach(boton => boton.addEventListener('click', abrirFormulario));
document.getElementById('closeQrForm').addEventListener('click', cerrarFormulario);
modal.addEventListener('click', event => {
  if (event.target === modal) cerrarFormulario();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') cerrarFormulario();
});

function finalizarSolicitud() {
  solicitudEnCurso = false;
  botonEnviar.disabled = false;
  botonEnviar.innerHTML = 'Enviar y recibir mi QR <span aria-hidden="true">↗</span>';
  clearTimeout(temporizadorSolicitud);
}
function enviarFormulario(datos) {
  if (solicitudEnCurso) return;
  solicitudEnCurso = true;
  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Enviando…';
  estado.classList.remove('error');
  estado.textContent = 'Guardando tus datos y generando el QR…';

  const callback = `juaniQrCallback_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const parametros = new URLSearchParams({ ...datos, callback });
  const script = document.createElement('script');
  let resuelta = false;
  const limpiar = () => {
    clearTimeout(temporizadorSolicitud);
    script.remove();
    delete window[callback];
  };
  const responder = data => {
    if (resuelta) return;
    resuelta = true;
    limpiar();
    finalizarSolicitud();
    if (data && data.ok) {
      estado.classList.remove('error');
      estado.textContent = '¡Listo! Te enviamos el QR al email indicado. Revisá también correo no deseado.';
      formulario.reset();
    } else {
      estado.classList.add('error');
      estado.textContent = (data && data.mensaje) || 'No se pudo registrar. Revisá tus datos e intentá nuevamente.';
    }
  };
  window[callback] = responder;
  script.onerror = () => responder({
    ok: false,
    mensaje: 'No se pudo conectar con el sistema QR. Intentá de nuevo en unos minutos.'
  });
  script.src = `${SCRIPT_URL}?${parametros.toString()}`;
  temporizadorSolicitud = setTimeout(() => {
    if (resuelta) return;
    resuelta = true;
    limpiar();
    finalizarSolicitud();
    estado.classList.add('error');
    estado.textContent = 'El sistema está tardando. Antes de volver a enviar, revisá tu correo por si el QR ya llegó.';
  }, 15000);
  document.body.appendChild(script);
}

formulario.addEventListener('submit', event => {
  event.preventDefault();
  if (solicitudEnCurso) return;
  const entrada = new FormData(formulario);
  const dni = String(entrada.get('dni') || '').replace(/\D/g, '');
  if (dni.length < 7) {
    estado.classList.add('error');
    estado.textContent = 'Revisá el DNI: debe tener al menos 7 números.';
    return;
  }
  enviarFormulario({
    nombre: String(entrada.get('nombre') || '').trim(),
    dni,
    email: String(entrada.get('email') || '').trim(),
    cantidad: String(entrada.get('cantidad') || '1'),
    restricciones: String(entrada.get('restricciones') || '').trim()
  });
});
