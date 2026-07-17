const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('ADMIN'));

// GET /api/audit — listar logs de auditoría
router.get('/', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ data: logs, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[audit] Error:', err);
    res.status(500).json({ error: 'Error al obtener historial.' });
  }
});

module.exports = router;
