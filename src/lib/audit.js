const prisma = require('./prisma');

async function registrarAuditoria({ usuario, usuarioId, accion, entidad, entidadId, detalle }) {
  try {
    await prisma.auditLog.create({
      data: {
        usuario: usuario || 'Sistema',
        usuarioId: usuarioId || null,
        accion,
        entidad,
        entidadId: entidadId || null,
        detalle: detalle || null,
      },
    });
  } catch (err) {
    console.error('[audit] Error registrando:', err.message);
  }
}

module.exports = { registrarAuditoria };
