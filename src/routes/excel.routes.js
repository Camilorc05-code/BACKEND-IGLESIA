const express = require('express');
const ExcelJS = require('exceljs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/excel/personas — descargar lista de miembros
router.get('/personas', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    const personas = await prisma.persona.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Miembros');

    ws.columns = [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Nombres', key: 'nombres', width: 25 },
      { header: 'Apellidos', key: 'apellidos', width: 25 },
      { header: 'Tipo Doc', key: 'tipoDocumento', width: 10 },
      { header: 'Número Doc', key: 'numeroDocumento', width: 15 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Barrio', key: 'barrio', width: 20 },
      { header: 'Dirección', key: 'direccion', width: 25 },
      { header: 'Fecha Nacimiento', key: 'fechaNacimiento', width: 16 },
      { header: 'Género', key: 'genero', width: 10 },
      { header: 'Estado Civil', key: 'estadoCivil', width: 14 },
      { header: 'Ministerio', key: 'ministerio', width: 18 },
      { header: 'Rol Iglesia', key: 'rolIglesia', width: 16 },
      { header: 'Bautizado', key: 'bautizado', width: 10 },
      { header: 'Fecha Bautismo', key: 'fechaBautismo', width: 16 },
      { header: 'Notas', key: 'notas', width: 30 },
      { header: 'Activo', key: 'activo', width: 8 },
      { header: 'Fecha Ingreso', key: 'fechaIngreso', width: 16 },
    ];

    // Estilo encabezado
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    personas.forEach((p) => {
      ws.addRow({
        id: p.id,
        nombres: p.nombres,
        apellidos: p.apellidos,
        tipoDocumento: p.tipoDocumento || '',
        numeroDocumento: p.numeroDocumento || '',
        telefono: p.telefono || '',
        email: p.email || '',
        barrio: p.barrio || '',
        direccion: p.direccion || '',
        fechaNacimiento: p.fechaNacimiento ? new Date(p.fechaNacimiento).toLocaleDateString('es-CO') : '',
        genero: p.genero || '',
        estadoCivil: p.estadoCivil || '',
        ministerio: p.ministerio || '',
        rolIglesia: p.rolIglesia || '',
        bautizado: p.bautizado ? 'Sí' : 'No',
        fechaBautismo: p.fechaBautismo ? new Date(p.fechaBautismo).toLocaleDateString('es-CO') : '',
        notas: p.notas || '',
        activo: p.activo ? 'Sí' : 'No',
        fechaIngreso: new Date(p.fechaIngreso).toLocaleDateString('es-CO'),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=miembros.xlsx');

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel de miembros.' });
  }
});

// GET /api/excel/presentaciones — descargar lista de presentaciones de bebés
router.get('/presentaciones', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    const lista = await prisma.presentacionBebe.findMany({
      orderBy: { fechaPresentacion: 'desc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Presentaciones de Bebés');

    ws.columns = [
      { header: 'ID', key: 'id', width: 6 },
      { header: 'Nombre del Bebé', key: 'nombreBebe', width: 25 },
      { header: 'Fecha Nacimiento', key: 'fechaNacimiento', width: 16 },
      { header: 'Nombre Madre', key: 'nombreMadre', width: 25 },
      { header: 'Nombre Padre', key: 'nombrePadre', width: 25 },
      { header: 'Fecha Presentación', key: 'fechaPresentacion', width: 18 },
      { header: 'Notas', key: 'notas', width: 30 },
      { header: 'Fecha Registro', key: 'createdAt', width: 16 },
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    lista.forEach((p) => {
      ws.addRow({
        id: p.id,
        nombreBebe: p.nombreBebe,
        fechaNacimiento: new Date(p.fechaNacimiento).toLocaleDateString('es-CO'),
        nombreMadre: p.nombreMadre,
        nombrePadre: p.nombrePadre,
        fechaPresentacion: new Date(p.fechaPresentacion).toLocaleDateString('es-CO'),
        notas: p.notas || '',
        createdAt: new Date(p.createdAt).toLocaleDateString('es-CO'),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=presentaciones-bebes.xlsx');

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel de presentaciones.' });
  }
});

module.exports = router;
