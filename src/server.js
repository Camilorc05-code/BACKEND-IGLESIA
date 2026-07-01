require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const personasRoutes = require('./routes/personas.routes');
const serviciosRoutes = require('./routes/servicios.routes');
const eventosRoutes = require('./routes/eventos.routes');
const citasRoutes = require('./routes/citas.routes');

const app = express();

// CORS: en producción, restringe esto al dominio de tu frontend (ver .env)
const allowedOrigins = (process.env.FRONTEND_URL || '*').split(',');
app.use(
  cors({
    origin: allowedOrigins.includes('*') ? true : allowedOrigins,
  })
);

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'API - Iglesia Misión Panamericana Centro de Fe y Esperanza', ok: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/personas', personasRoutes);
app.use('/api/servicios', serviciosRoutes);
app.use('/api/eventos', eventosRoutes);
app.use('/api/citas', citasRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// Manejo de errores generales
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
