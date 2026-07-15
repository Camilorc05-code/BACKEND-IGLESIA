const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configuración de multer: guarda en /uploads con nombre único
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  },
});

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
});

// POST /api/upload — sube una o varias imágenes (requiere auth)
router.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'PASTOR', 'LIDER'),
  upload.array('imagenes', 20), // máximo 20 archivos por petición
  (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se enviaron archivos.' });
    }

    // Construye las URLs completas
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const urls = req.files.map((f) => ({
      url: `${baseUrl}/uploads/${f.filename}`,
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
    }));

    res.json({ archivos: urls, urls: urls.map((u) => u.url) });
  }
);

// Error de multer (tamaño, tipo, etc.)
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
