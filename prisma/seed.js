// Crea el primer usuario ADMIN y algunos datos de ejemplo.
// Ejecutar con: npm run seed
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const emailAdmin = 'jhojancamilorodriguez2017@gmail.com';
  const existeAdmin = await prisma.usuario.findUnique({ where: { email: emailAdmin } });

  if (!existeAdmin) {
    const passwordHash = await bcrypt.hash('camilo74845348', 10);
    await prisma.usuario.create({
      data: {
        nombre: 'Administrador',
        email: emailAdmin,
        passwordHash,
        rol: 'ADMIN',
      },
    });
    console.log('✅ Usuario admin creado:');
    console.log('   Email: jhojancamilorodriguez2017@gmail.com');
    console.log('   Password: camilo74845348');
  } else {
    console.log('El usuario admin ya existe, se omite.');
  }

  // Horarios de servicio de ejemplo
  const serviciosCount = await prisma.servicio.count();
  if (serviciosCount === 0) {
    await prisma.servicio.createMany({
      data: [
        {
          nombre: 'Servicio Dominical',
          diaSemana: 'Domingo',
          horaInicio: '09:00',
          horaFin: '11:00',
          lugar: 'Templo Principal',
        },
        {
          nombre: 'Culto de Oración',
          diaSemana: 'Miércoles',
          horaInicio: '19:00',
          horaFin: '20:30',
          lugar: 'Templo Principal',
        },
        {
          nombre: 'Servicio de Jóvenes',
          diaSemana: 'Viernes',
          horaInicio: '19:00',
          horaFin: '21:00',
          lugar: 'Salón Anexo',
        },
      ],
    });
    console.log('✅ Horarios de servicio de ejemplo creados.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
