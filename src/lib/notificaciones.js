const prisma = require('./prisma');

const ICONOS = {
  nuevo_miembro: '👤',
  nueva_cita: '📅',
  recordatorio: '🔔',
  sistema: '⚙️',
};

async function crearNotificacion({ tipo, titulo, mensaje }) {
  try {
    await prisma.notificacion.create({ data: { tipo, titulo, mensaje } });
  } catch (err) {
    console.error('[notif] Error creando notificación:', err.message);
  }

  // Enviar push notification a todos los suscritos
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:admin@misionpanamericana.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const subscriptions = await prisma.pushSubscription.findMany();
    const icono = ICONOS[tipo] || '📌';
    const payload = JSON.stringify({ titulo: `${icono} ${titulo}`, mensaje, url: '/admin' });

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

module.exports = { crearNotificacion };
