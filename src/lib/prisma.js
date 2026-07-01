const { PrismaClient } = require('@prisma/client');

// Reutilizamos una sola instancia (buena práctica con Prisma en Node)
const prisma = new PrismaClient();

module.exports = prisma;
