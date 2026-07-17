const express = require('express');
const ExcelJS = require('exceljs');
const prisma = require('../lib/prisma');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function estiloEncabezado(ws, numCols) {
  ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
  ws.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' };
}

function agregarTitulo(ws, titulo, numCols) {
  ws.spliceRows(1, 0, []);
  ws.mergeCells(1, 1, 1, numCols);
  const celda = ws.getCell(1, 1);
  celda.value = titulo;
  celda.font = { bold: true, size: 14, color: { argb: 'FF1A1A2E' } };
  celda.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 30;
}

// GET /api/excel/personas — descargar lista de miembros
router.get('/personas', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    const personas = await prisma.persona.findMany({
      where: { activo: true },
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Miembros');

    ws.columns = [
      { header: '#', key: 'num', width: 5 },
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
      { header: 'Ministerio', key: 'ministerio', width: 18 },
      { header: 'Rol Iglesia', key: 'rolIglesia', width: 16 },
      { header: 'Bautizado', key: 'bautizado', width: 10 },
      { header: 'Fecha Bautismo', key: 'fechaBautismo', width: 16 },
      { header: 'Notas', key: 'notas', width: 30 },
      { header: 'Fecha Ingreso', key: 'fechaIngreso', width: 16 },
    ];

    agregarTitulo(ws, 'Miembros — Misión Panamericana', 17);
    estiloEncabezado(ws, 17);

    personas.forEach((p, i) => {
      ws.addRow({
        num: i + 1,
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
        ministerio: p.ministerio || '',
        rolIglesia: p.rolIglesia || '',
        bautizado: p.bautizado ? 'Sí' : 'No',
        fechaBautismo: p.fechaBautismo ? new Date(p.fechaBautismo).toLocaleDateString('es-CO') : '',
        notas: p.notas || '',
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
      orderBy: { fechaPresentacion: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Presentaciones de Bebés');

    ws.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Nombre del Bebé', key: 'nombreBebe', width: 25 },
      { header: 'Fecha Nacimiento', key: 'fechaNacimiento', width: 16 },
      { header: 'Nombre Madre', key: 'nombreMadre', width: 25 },
      { header: 'Nombre Padre', key: 'nombrePadre', width: 25 },
      { header: 'Fecha Presentación', key: 'fechaPresentacion', width: 18 },
      { header: 'Notas', key: 'notas', width: 30 },
      { header: 'Fecha Registro', key: 'createdAt', width: 16 },
    ];

    agregarTitulo(ws, 'Presentaciones de Bebés — Misión Panamericana', 8);
    estiloEncabezado(ws, 8);

    lista.forEach((p, i) => {
      ws.addRow({
        num: i + 1,
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

// GET /api/excel/visitas — descargar lista de nuevos visitantes
router.get('/visitas', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  try {
    const lista = await prisma.visita.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Nuevos');

    ws.columns = [
      { header: '#', key: 'num', width: 5 },
      { header: 'Nombres', key: 'nombres', width: 25 },
      { header: 'Apellidos', key: 'apellidos', width: 25 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Barrio', key: 'barrio', width: 20 },
      { header: 'Dirección', key: 'direccion', width: 25 },
      { header: 'Asiste otra iglesia', key: 'asisteOtraIglesia', width: 18 },
      { header: 'Desea llamada', key: 'desearLlamada', width: 16 },
      { header: 'Mensaje / Petición', key: 'adicional', width: 35 },
      { header: 'Fecha registro', key: 'createdAt', width: 16 },
    ];

    agregarTitulo(ws, 'Nuevos Visitantes — Misión Panamericana', 11);
    estiloEncabezado(ws, 11);

    lista.forEach((v, i) => {
      ws.addRow({
        num: i + 1,
        nombres: v.nombres,
        apellidos: v.apellidos,
        telefono: v.telefono,
        email: v.email || '',
        barrio: v.barrio || '',
        direccion: v.direccion || '',
        asisteOtraIglesia: v.asisteOtraIglesia,
        desearLlamada: v.desearLlamada,
        adicional: v.adicional || '',
        createdAt: new Date(v.createdAt).toLocaleDateString('es-CO'),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=nuevos.xlsx');

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar Excel de visitas.' });
  }
});

module.exports = router;
