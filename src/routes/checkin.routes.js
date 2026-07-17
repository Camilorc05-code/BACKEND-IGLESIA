const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/checkin/buscar — buscar persona por teléfono (sin auth)
router.post('/buscar', async (req, res) => {
  const { telefono } = req.body;
  if (!telefono) return res.status(400).json({ error: 'Teléfono requerido.' });

  const tel = telefono.replace(/\s/g, '').replace(/\D/g, '');

  try {
    const persona = await prisma.persona.findFirst({
      where: {
        telefono: { contains: tel },
        activo: true,
      },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        telefono: true,
        rolIglesia: true,
        ministerio: true,
      },
    });

    if (!persona) {
      return res.status(404).json({ error: 'No encontramos tu número. Acércate a un líder para registrarte.' });
    }

    res.json(persona);
  } catch (err) {
    console.error('[checkin] Error buscando persona:', err);
    res.status(500).json({ error: 'Error al buscar.' });
  }
});

// POST /api/checkin/registrar — registrar asistencia (sin auth, público)
router.post('/registrar', async (req, res) => {
  const { personaId, servicio } = req.body;
  if (!personaId) return res.status(400).json({ error: 'personaId requerido.' });

  try {
    const persona = await prisma.persona.findUnique({ where: { id: personaId } });
    if (!persona) return res.status(404).json({ error: 'Persona no encontrada.' });

    // Verificar si ya se registró hoy en este servicio
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const existente = await prisma.asistencia.findFirst({
      where: {
        personaId,
        servicio: servicio || null,
        fecha: { gte: hoy, lt: manana },
      },
    });

    if (existente) {
      return res.json({
        ok: true,
        duplicate: true,
        mensaje: `${persona.nombres} ya está registrado para este servicio.`,
        persona: { id: persona.id, nombres: persona.nombres, apellidos: persona.apellidos },
      });
    }

    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });

    const asistencia = await prisma.asistencia.create({
      data: {
        personaId,
        servicio: servicio || null,
        fecha: ahora,
        hora,
      },
    });

    res.json({
      ok: true,
      duplicate: false,
      mensaje: `✅ ${persona.nombres} ${persona.apellidos} registrado a las ${hora}`,
      persona: { id: persona.id, nombres: persona.nombres, apellidos: persona.apellidos },
      asistencia,
    });
  } catch (err) {
    console.error('[checkin] Error registrando asistencia:', err);
    res.status(500).json({ error: 'Error al registrar asistencia.' });
  }
});

// GET /api/checkin/hoy — ver asistencia de hoy (admin)
router.get('/hoy', requireAuth, async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const asistencias = await prisma.asistencia.findMany({
      where: { fecha: { gte: hoy, lt: manana } },
      include: { persona: { select: { id: true, nombres: true, apellidos: true, telefono: true, ministerio: true } } },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ fecha: hoy, total: asistencias.length, asistencias });
  } catch (err) {
    console.error('[checkin] Error:', err);
    res.status(500).json({ error: 'Error al obtener asistencia.' });
  }
});

// GET /api/checkin/historial — ver historial de asistencia (admin)
router.get('/historial', requireAuth, async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  try {
    const [asistencias, total] = await Promise.all([
      prisma.asistencia.findMany({
        include: { persona: { select: { id: true, nombres: true, apellidos: true, telefono: true } } },
        orderBy: { fecha: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.asistencia.count(),
    ]);

    res.json({ data: asistencias, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[checkin] Error:', err);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

module.exports = router;
