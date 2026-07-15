const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const supabase = require('../lib/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const BUCKET = 'iglesia'; // nombre del bucket en Supabase Storage

// Configuración de multer: usa memoria (buffer) para subir directo a Supabase
const storage = multer.memoryStorage();

// Filtro: solo imágenes
const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
  if (allowed.test(path.extname(file.originalname)) && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de imagen (jpg, png, gif, webp, svg)'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo por archivo
});

// POST /api/upload — sube imágenes a Supabase Storage
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  upload.array('imagenes', 20),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se enviaron archivos.' });
    }

    try {
      const resultados = [];

      for (const file of req.files) {
        const ext = path.extname(file.originalname).toLowerCase();
        const nombreUnico = `${crypto.randomBytes(16).toString('hex')}${ext}`;
        const filePath = `uploads/${nombreUnico}`;

        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
          });

        if (error) {
          console.error('Error subiendo a Supabase:', error.message);
          return res.status(500).json({ error: `Error al subir "${file.originalname}": ${error.message}` });
        }

        // Obtener URL pública
        const { data: urlData } = supabase.storage
          .from(BUCKET)
          .getPublicUrl(filePath);

        resultados.push({
          url: urlData.publicUrl,
          filename: nombreUnico,
          originalname: file.originalname,
          size: file.size,
        });
      }

      res.json({
        archivos: resultados,
        urls: resultados.map((r) => r.url),
      });
    } catch (err) {
      console.error('Error en upload:', err);
      res.status(500).json({ error: 'Error interno al subir imágenes.' });
    }
  }
);

// DELETE /api/upload — elimina una imagen de Supabase Storage
router.delete('/', requireAuth, requireRole('ADMIN', 'PASTOR', 'LIDER'), async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ error: 'Se requiere el nombre del archivo.' });
  }

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([`uploads/${filename}`]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar archivo.' });
  }
});

// Error de multer
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo excede el tamaño máximo de 5MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Demasiados archivos. Máximo 20 por vez.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

module.exports = router;
