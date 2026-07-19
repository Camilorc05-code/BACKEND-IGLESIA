const express = require('express');
const prisma = require('../lib/prisma');
const { crearNotificacion } = require('../lib/notificaciones');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/alertas/inasistencia — miembros con 3+ domingos seguidos sin asistir
router.get('/inasistencia', requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    // Obtener todos los miembros activos
    const personas = await prisma.persona.findMany({
      where: { activo: true },
      select: { id: true, nombres: true, apellidos: true, telefono: true, email: true, fechaNacimiento: true },
      orderBy: { nombres: 'asc' },
    });

    const hoy = new Date();
    const alertas = [];

    for (const persona of personas) {
      // Obtener las últimas 4 fechas de domingo con asistencia de esta persona
      const asistencias = await prisma.asistencia.findMany({
        where: { personaId: persona.id, servicio: { contains: 'Domingo' } },
        orderBy: { fecha: 'desc' },
        take: 10,
        select: { fecha: true },
      });

      if (asistencias.length === 0) {
        // Nunca ha asistido — no alertar
        continue;
      }

      // Calcular los últimos 3 domingos
      const domingos = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date(hoy);
        d.setDate(d.getDate() - d.getDay() - (7 * i)); // retroceder al domingo
        d.setHours(0, 0, 0, 0);
        domingos.push(d);
      }

      // Verificar si faltó a los 3 últimos domingos
      let faltos = 0;
      for (const domingo of domingos) {
        const asistio = asistencias.some((a) => {
          const fechaAsistencia = new Date(a.fecha);
          return fechaAsistencia.toDateString() === domingo.toDateString();
        });
        if (!asistio) faltos++;
      }

      if (faltos >= 3) {
        const ultimaAsistencia = asistencias[0];
        const fechaUltima = ultimaAsistencia ? new Date(ultimaAsistencia.fecha).toLocaleDateString('es-CO') : 'Nunca';
        alertas.push({
          ...persona,
          ultimaAsistencia: fechaUltima,
          domingosSinAsistir: faltos,
        });
      }
    }

    res.json(alertas);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al verificar inasistencia.' });
  }
});

// GET /api/alertas/cumpleanos — miembros que cumplen años este mes
router.get('/cumpleanos', requireRole('ADMIN', 'PASTOR'), async (req, res) => {
  try {
    const hoy = new Date();
    const mesActual = hoy.getMonth();
    const diaActual = hoy.getDate();

    const personas = await prisma.persona.findMany({
      where: {
        activo: true,
        fechaNacimiento: { not: null },
      },
      select: { id: true, nombres: true, apellidos: true, telefono: true, email: true, fechaNacimiento: true },
    });

    const cumpleanos = personas
      .filter((p) => {
        const fecha = new Date(p.fechaNacimiento);
        return fecha.getMonth() === mesActual;
      })
      .map((p) => {
        const fecha = new Date(p.fechaNacimiento);
        const dia = fecha.getDate();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const diffDias = dia - diaActual;
        return {
          ...p,
          diaCumple: dia,
          mesCumple: meses[mesActual],
          diasHasta: diffDias >= 0 ? diffDias : 0,
          yaPaso: diffDias < 0,
        };
      })
      .sort((a, b) => a.diaCumple - b.diaCumple);

    // También incluir los de hoy
    const hoyList = cumpleanos.filter((c) => c.diaCumple === diaActual);

    res.json({ hoy: hoyList, proximos: cumpleanos.filter((c) => c.diaCumple !== diaActual) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cumpleaños.' });
  }
});

// POST /api/alertas/cumpleanos/enviar-notificacion — enviar notificación de cumpleaños a un miembro
router.post('/cumpleanos/enviar-notificacion', requireRole('ADMIN'), async (req, res) => {
  const { personaId } = req.body;
  try {
    const persona = await prisma.persona.findUnique({ where: { id: Number(personaId) } });
    if (!persona) return res.status(404).json({ error: 'Persona no encontrada.' });

    await crearNotificacion({
      tipo: 'sistema',
      titulo: 'Feliz cumpleaños!',
      mensaje: `Hoy es el cumpleaños de ${persona.nombres} ${persona.apellidos}. ¡No olvides felicitarlo/a!`,
    });

    res.json({ ok: true, mensaje: 'Notificación enviada.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al enviar notificación.' });
  }
});

module.exports = router;
