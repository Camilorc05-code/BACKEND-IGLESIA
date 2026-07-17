const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');
const { enviarCorreo, plantillaRecordatorio, plantillaRecordatorioSolicitante } = require('../lib/mail');
const { crearNotificacion } = require('../lib/notificaciones');

// Helper local para formato 12h (reutiliza la lógica de mail.js)
function formatTime12h(hora) {
  if (!hora) return '';
  const [h, m] = hora.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const horas12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${horas12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const router = express.Router();

// Evita spam en el formulario público de citas: máx 5 solicitudes cada 15 min por IP
const limiterCitasPublicas = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
});

// GET /api/citas/pastores-disponibles — PÚBLICO (lista de pastores/líderes para el formulario)
router.get('/pastores-disponibles', async (req, res) => {
  try {
    const pastores = await prisma.usuario.findMany({
      where: { rol: { in: ['PASTOR', 'LIDER'] }, activo: true },
      select: { id: true, nombre: true, rol: true },
    });
    res.json(pastores);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener pastores.' });
  }
});

// GET /api/citas/ocupados — PÚBLICO: devuelve slots ocupados para el calendario
// Query params opcionales: mes (YYYY-MM), pastorId
router.get('/ocupados', async (req, res) => {
  const { mes, pastorId } = req.query;

  const where = {
    estado: { not: 'CANCELADA' },
    ...(pastorId ? { pastorId: Number(pastorId) } : {}),
    ...(mes
      ? {
          fecha: {
            gte: new Date(mes + '-01T00:00:00.000Z'),
            lt: new Date(new Date(mes + '-01T00:00:00.000Z').setMonth(new Date(mes + '-01T00:00:00.000Z').getMonth() + 1)),
          },
        }
      : {}),
  };

  try {
    const citas = await prisma.cita.findMany({
      where,
      select: {
        fecha: true,
        hora: true,
        pastorId: true,
        estado: true,
      },
      orderBy: { fecha: 'asc' },
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener citas ocupadas.' });
  }
});

// POST /api/citas — PÚBLICO: cualquier visitante puede agendar una cita
router.post(
  '/',
  limiterCitasPublicas,
  [
    body('nombreSolicitante').notEmpty(),
    body('telefonoSolicitante').notEmpty(),
    body('pastorId').isInt(),
    body('fecha').isISO8601(),
    body('hora').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const {
      nombreSolicitante,
      telefonoSolicitante,
      emailSolicitante,
      pastorId,
      fecha,
      hora,
      motivo,
      personaId,
    } = req.body;

    try {
      // Evitar doble reserva: mismo pastor, misma fecha y hora, que no esté cancelada
      const ocupado = await prisma.cita.findFirst({
        where: {
          pastorId: Number(pastorId),
          fecha: new Date(fecha),
          hora,
          estado: { not: 'CANCELADA' },
        },
      });
      if (ocupado) {
        return res.status(409).json({ error: 'Ese horario ya está reservado. Elige otro.' });
      }

      const cita = await prisma.cita.create({
        data: {
          nombreSolicitante,
          telefonoSolicitante,
          emailSolicitante,
          pastorId: Number(pastorId),
          fecha: new Date(fecha),
          hora,
          motivo,
          personaId: personaId ? Number(personaId) : undefined,
        },
        include: { pastor: { select: { nombre: true, email: true } } },
      });

      // Notificar al pastor/líder por correo
      if (cita.pastor?.email) {
        const fechaFormato = new Date(fecha).toLocaleDateString('es-CO', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });
        const html = `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8">
          <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;margin:0;padding:20px}.container{max-width:500px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}.header{background:linear-gradient(135deg,#024293,#3E52C3);padding:28px 24px;text-align:center}.header h1{color:#FFCD02;font-size:20px;margin:0 0 4px}.header p{color:rgba(255,255,255,.8);font-size:13px;margin:0}.body{padding:24px}.badge{display:inline-block;background:#E1011D;color:#fff;font-size:11px;font-weight:700;padding:4px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px}.detail{margin:16px 0;padding:16px;background:#f1f5fb;border-radius:12px}.detail-row{display:flex;margin-bottom:8px}.detail-row:last-child{margin-bottom:0}.detail-label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;min-width:80px}.detail-value{font-size:14px;color:#0A2A57;font-weight:500}.footer{padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0}.footer p{font-size:11px;color:#94a3b8;margin:0}</style>
          </head><body><div class="container">
          <div class="header"><h1>Misión Panamericana</h1><p>Centro de Fe y Esperanza</p></div>
          <div class="body">
            <p style="margin:0 0 8px"><span class="badge">Nueva cita</span></p>
            <p style="font-size:15px;color:#334155;margin:0 0 16px">Hola <strong>${cita.pastor.nombre}</strong>, se ha agendado una nueva cita contigo:</p>
            <div class="detail">
              <div class="detail-row"><span class="detail-label">Fecha</span><span class="detail-value">${fechaFormato}</span></div>
              <div class="detail-row"><span class="detail-label">Hora</span><span class="detail-value">${formatTime12h(hora)}</span></div>
              <div class="detail-row"><span class="detail-label">Persona</span><span class="detail-value">${nombreSolicitante}</span></div>
              <div class="detail-row"><span class="detail-label">Teléfono</span><span class="detail-value">${telefonoSolicitante}</span></div>
              ${motivo ? `<div class="detail-row"><span class="detail-label">Motivo</span><span class="detail-value">${motivo}</span></div>` : ''}
            </div>
            <p style="font-size:13px;color:#64748b;margin:16px 0 0">Confirma o cancela la cita desde el panel de administración.</p>
          </div>
          <div class="footer"><p>Correo automático — Misión Panamericana</p></div>
          </div></body></html>
        `;
        enviarCorreo({
          to: cita.pastor.email,
          subject: `Nueva cita pastoral: ${nombreSolicitante} — ${fechaFormato}`,
          html,
        }).catch((err) => console.error('[mail] Error notificando nueva cita:', err.message));
      }

      res.status(201).json({
        mensaje: 'Cita solicitada correctamente. Te contactaremos para confirmar.',
        cita,
      });
      crearNotificacion({ tipo: 'nueva_cita', titulo: 'Nueva cita agendada', mensaje: `${nombreSolicitante} agendó cita para el ${new Date(fecha).toLocaleDateString('es-CO')} a las ${hora}.` }, { push: true, pushUsuarioId: Number(pastorId) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al solicitar la cita.' });
    }
  }
);

// GET /api/citas/auto-recordatorios — envía recordatorios automáticos (UptimeRobot / cron)
// ANTES de requireAuth para que UptimeRobot no reciba 401
router.get('/auto-recordatorios', async (req, res) => {
  const token = req.query.token;
  if (!token || token !== process.env.REMINDER_SECRET) {
    return res.status(401).json({ error: 'Token inválido.' });
  }

  const ahora = new Date();
  const en24h = new Date(ahora.getTime() + 24 * 60 * 60 * 1000);

  try {
    // 1) Recordatorios al pastor (citas dentro de 48h)
    const en48h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);
    const citasPastor = await prisma.cita.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        recordatorioEnviado: false,
        fecha: { gte: ahora, lte: en48h },
      },
      include: { pastor: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });

    let enviadosPastor = 0;
    for (const cita of citasPastor) {
      if (!cita.pastor?.email) continue;
      try {
        const html = plantillaRecordatorio({
          pastorNombre: cita.pastor.nombre,
          solicitante: cita.nombreSolicitante,
          fecha: cita.fecha,
          hora: cita.hora,
          motivo: cita.motivo,
        });
        await enviarCorreo({ to: cita.pastor.email, subject: `Recordatorio: Cita pastoral con ${cita.nombreSolicitante}`, html });
        await prisma.cita.update({ where: { id: cita.id }, data: { recordatorioEnviado: true } });
        enviadosPastor++;
      } catch (err) {
        console.error(`[recordatorios] Error enviando a pastor ${cita.pastor.email}:`, err.message);
      }
    }

    // 2) Recordatorios al solicitante (citas dentro de 24h)
    const citasSolicitante = await prisma.cita.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        recordatorioSolicitante: false,
        emailSolicitante: { not: null },
        fecha: { gte: ahora, lte: en24h },
      },
      include: { pastor: { select: { nombre: true } } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });

    let enviadosSolicitante = 0;
    for (const cita of citasSolicitante) {
      try {
        const html = plantillaRecordatorioSolicitante({
          nombre: cita.nombreSolicitante,
          pastorNombre: cita.pastor?.nombre || 'Pastor',
          fecha: cita.fecha,
          hora: cita.hora,
          motivo: cita.motivo,
        });
        await enviarCorreo({ to: cita.emailSolicitante, subject: `Recordatorio: Tu cita pastoral mañana`, html });
        await prisma.cita.update({ where: { id: cita.id }, data: { recordatorioSolicitante: true } });
        enviadosSolicitante++;
      } catch (err) {
        console.error(`[recordatorios] Error enviando a solicitante ${cita.emailSolicitante}:`, err.message);
      }
    }

    if (enviadosPastor > 0) {
      crearNotificacion({ tipo: 'recordatorio', titulo: 'Recordatorios enviados', mensaje: `Se enviaron ${enviadosPastor} recordatorio(s) a pastores.` });
    }
    if (enviadosSolicitante > 0) {
      crearNotificacion({ tipo: 'recordatorio', titulo: 'Recordatorios enviados', mensaje: `Se enviaron ${enviadosSolicitante} recordatorio(s) a solicitantes.` });
    }

    res.json({
      mensaje: `Pastor: ${enviadosPastor} | Solicitante: ${enviadosSolicitante}`,
      pastor: enviadosPastor,
      solicitante: enviadosSolicitante,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar recordatorios.' });
  }
});

// A partir de aquí, todo requiere estar autenticado (equipo pastoral)
router.use(requireAuth);

// GET /api/citas/recordatorios — citas próximas (48h) que aún no tienen recordatorio enviado
router.get('/recordatorios', async (req, res) => {
  const ahora = new Date();
  const en48h = new Date(ahora.getTime() + 48 * 60 * 60 * 1000);

  try {
    const citas = await prisma.cita.findMany({
      where: {
        estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
        recordatorioEnviado: false,
        fecha: { gte: ahora, lte: en48h },
      },
      include: { pastor: { select: { id: true, nombre: true, email: true } } },
      orderBy: [{ fecha: 'asc' }, { hora: 'asc' }],
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener recordatorios.' });
  }
});

// PUT /api/citas/:id/recordatorio — marcar recordatorio como enviado + enviar correo al pastor
router.put('/:id/recordatorio', async (req, res) => {
  try {
    const cita = await prisma.cita.update({
      where: { id: Number(req.params.id) },
      data: { recordatorioEnviado: true },
      include: { pastor: { select: { id: true, nombre: true, email: true } } },
    });

    // Enviar correo de recordatorio al pastor/líder
    if (cita.pastor?.email) {
      const html = plantillaRecordatorio({
        pastorNombre: cita.pastor.nombre,
        solicitante: cita.nombreSolicitante,
        fecha: cita.fecha,
        hora: cita.hora,
        motivo: cita.motivo,
      });

      enviarCorreo({
        to: cita.pastor.email,
        subject: `Recordatorio: Cita pastoral con ${cita.nombreSolicitante}`,
        html,
      }).catch((err) => console.error('[mail] Error enviando recordatorio:', err.message));
    }

    res.json(cita);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar recordatorio.' });
  }
});

// GET /api/citas?estado=&pastorId=&desde=&hasta=
router.get('/', async (req, res) => {
  const { estado, pastorId, desde, hasta } = req.query;

  const where = {
    ...(estado ? { estado } : {}),
    ...(pastorId ? { pastorId: Number(pastorId) } : {}),
    ...(desde || hasta
      ? {
          fecha: {
            ...(desde ? { gte: new Date(desde) } : {}),
            ...(hasta ? { lte: new Date(hasta) } : {}),
          },
        }
      : {}),
  };

  try {
    const citas = await prisma.cita.findMany({
      where,
      include: { pastor: { select: { id: true, nombre: true } }, persona: true },
      orderBy: { fecha: 'asc' },
    });
    res.json(citas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar citas.' });
  }
});

// PUT /api/citas/:id/estado — confirmar, cancelar, completar
router.put(
  '/:id/estado',
  [body('estado').isIn(['PENDIENTE', 'CONFIRMADA', 'CANCELADA', 'COMPLETADA'])],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Estado inválido', details: errors.array() });
    }
    try {
      const cita = await prisma.cita.update({
        where: { id: Number(req.params.id) },
        data: { estado: req.body.estado, notasInternas: req.body.notasInternas },
      });
      res.json(cita);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Error al actualizar la cita.' });
    }
  }
);

// DELETE /api/citas/:id — ADMIN/PASTOR/LIDER
router.delete('/:id', requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    await prisma.cita.delete({ where: { id: Number(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la cita.' });
  }
});

module.exports = router;
