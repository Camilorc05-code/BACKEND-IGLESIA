const express = require('express');
const webpush = require('web-push');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configurar VAPID
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@misionpanamericana.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET /api/push/vapid-key — obtener la public key (público)
router.get('/vapid-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// POST /api/push/subscribe — guardar suscripción push
router.post('/subscribe', requireAuth, async (req, res) => {
  const { endpoint, p256dh, auth } = req.body;
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Datos de suscripción incompletos.' });
  }

  try {
    // Upsert: si ya existe el endpoint, actualizar
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth },
      create: { endpoint, p256dh, auth },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] Error guardando suscripción:', err.message);
    res.status(500).json({ error: 'Error al guardar suscripción.' });
  }
});

// DELETE /api/push/unsubscribe — eliminar suscripción
router.delete('/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint requerido.' });

  try {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[push] Error eliminando suscripción:', err.message);
    res.status(500).json({ error: 'Error al eliminar suscripción.' });
  }
});

// POST /api/push/send — enviar push a todos los suscritos (solo para uso interno)
router.post('/send', requireAuth, async (req, res) => {
  const { titulo, mensaje, url } = req.body;
  if (!titulo || !mensaje) {
    return res.status(400).json({ error: 'titulo y mensaje requeridos.' });
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany();
    const payload = JSON.stringify({ titulo, mensaje, url: url || '/admin' });

    let enviados = 0;
    let errores = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        enviados++;
      } catch (err) {
        // Si el suscriptor ya no es válido, eliminarlo
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
        }
        errores++;
      }
    }

    res.json({ enviados, errores, total: subscriptions.length });
  } catch (err) {
    console.error('[push] Error enviando pushes:', err.message);
    res.status(500).json({ error: 'Error al enviar pushes.' });
  }
});

module.exports = router;
