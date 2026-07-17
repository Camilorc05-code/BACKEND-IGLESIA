const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// GET /api/dashboard/estadisticas — métricas generales
router.get('/estadisticas', async (req, res) => {
  try {
    const ahora = new Date();

    // Miembros activos
    const totalMiembros = await prisma.persona.count({ where: { activo: true } });

    // Visitas registradas
    const totalVisitas = await prisma.visita.count();

    // Citas totales y por estado
    const [totalCitas, citasPendientes, citasConfirmadas, citasCompletadas, citasCanceladas] = await Promise.all([
      prisma.cita.count(),
      prisma.cita.count({ where: { estado: 'PENDIENTE' } }),
      prisma.cita.count({ where: { estado: 'CONFIRMADA' } }),
      prisma.cita.count({ where: { estado: 'COMPLETADA' } }),
      prisma.cita.count({ where: { estado: 'CANCELADA' } }),
    ]);

    // Bebés presentados
    const totalBebes = await prisma.presentacionBebe.count();

    // Usuarios activos
    const totalUsuarios = await prisma.usuario.count({ where: { activo: true } });

    // Nuevos miembros por mes (últimos 12 meses)
    const hace12Meses = new Date();
    hace12Meses.setMonth(hace12Meses.getMonth() - 11);
    hace12Meses.setDate(1);
    hace12Meses.setHours(0, 0, 0, 0);

    const personasPorMes = await prisma.persona.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: hace12Meses } },
      _count: true,
    });

    // Nuevas visitas por mes
    const visitasPorMes = await prisma.visita.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: hace12Meses } },
      _count: true,
    });

    // Citas por mes
    const citasPorMes = await prisma.cita.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: hace12Meses } },
      _count: true,
    });

    // Procesar datos por mes
    const meses = [];
    for (let i = 0; i < 12; i++) {
      const fecha = new Date();
      fecha.setMonth(fecha.getMonth() - (11 - i));
      const mes = fecha.getMonth();
      const anio = fecha.getFullYear();
      const label = fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });

      const miembrosMes = personasPorMes.filter((p) => {
        const d = new Date(p.createdAt);
        return d.getMonth() === mes && d.getFullYear() === anio;
      }).reduce((acc, p) => acc + p._count, 0);

      const visitasMes = visitasPorMes.filter((v) => {
        const d = new Date(v.createdAt);
        return d.getMonth() === mes && d.getFullYear() === anio;
      }).reduce((acc, v) => acc + v._count, 0);

      const citasMes = citasPorMes.filter((c) => {
        const d = new Date(c.createdAt);
        return d.getMonth() === mes && d.getFullYear() === anio;
      }).reduce((acc, c) => acc + c._count, 0);

      meses.push({ label, miembros: miembrosMes, visitas: visitasMes, citas: citasMes });
    }

    res.json({
      resumen: {
        totalMiembros,
        totalVisitas,
        totalCitas,
        totalBebes,
        totalUsuarios,
        citasPendientes,
        citasConfirmadas,
        citasCompletadas,
        citasCanceladas,
      },
      graficas: { meses },
    });
  } catch (err) {
    console.error('[dashboard] Error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

module.exports = router;
