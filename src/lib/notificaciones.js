const prisma = require('./prisma');

const ICONOS = {
  nuevo_miembro: '👤',
  nueva_cita: '📅',
  recordatorio: '🔔',
  sistema: '⚙️',
};

async function enviarPush(subscriptions, titulo, mensaje, url) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:admin@misionpanamericana.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const icono = titulo.startsWith('👤') || titulo.startsWith('📅') || titulo.startsWith('🔔') ? '' : '';
    const payload = JSON.stringify({ titulo, mensaje, url: url || '/admin' });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
      }
    }
  } catch (err) {
    console.error('[push] Error enviando push:', err.message);
  }
}

// Crear notificación in-app (+ push opcional)
// options: { push: false, pushUsuarioId: null, pushTodos: false }
async function crearNotificacion({ tipo, titulo, mensaje }, options = {}) {
  try {
    await prisma.notificacion.create({ data: { tipo, titulo, mensaje } });
  } catch (err) {
    console.error('[notif] Error creando notificación:', err.message);
  }

  if (!options.push) return;

  const icono = ICONOS[tipo] || '📌';
  const pushTitulo = `${icono} ${titulo}`;

  try {
    let subscriptions;
    if (options.pushUsuarioId) {
      subscriptions = await prisma.pushSubscription.findMany({
        where: { usuarioId: options.pushUsuarioId },
      });
    } else if (options.pushTodos) {
      subscriptions = await prisma.pushSubscription.findMany();
    }

    if (subscriptions && subscriptions.length > 0) {
      await enviarPush(subscriptions, pushTitulo, mensaje, options.url || '/admin');
    }
  } catch (err) {
    console.error('[push] Error enviando push:', err.message);
  }
}

module.exports = { crearNotificacion, enviarPush };
