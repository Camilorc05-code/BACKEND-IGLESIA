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

    // Gráficas: desde julio 2026 hasta el mes actual
    const inicioGraficas = new Date(2026, 6, 1); // Julio 2026
    const finGraficas = new Date();
    finGraficas.setDate(1);
    finGraficas.setHours(0, 0, 0, 0);

    // Si estamos antes de julio 2026, usar desde enero del año actual
    const fechaInicio = new Date(Math.min(inicioGraficas.getTime(), finGraficas.getTime()));
    fechaInicio.setMonth(fechaInicio.getMonth() - 11);
    if (fechaInicio < inicioGraficas) fechaInicio.setTime(inicioGraficas.getTime());

    const personasPorMes = await prisma.persona.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: fechaInicio } },
      _count: true,
    });

    const visitasPorMes = await prisma.visita.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: fechaInicio } },
      _count: true,
    });

    const citasPorMes = await prisma.cita.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: fechaInicio } },
      _count: true,
    });

    // Generar meses desde julio 2026 hasta el mes actual
    const meses = [];
    const fechaMes = new Date(fechaInicio);
    while (fechaMes <= finGraficas) {
      const mes = fechaMes.getMonth();
      const anio = fechaMes.getFullYear();
      const label = fechaMes.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });

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
      fechaMes.setMonth(fechaMes.getMonth() + 1);
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
