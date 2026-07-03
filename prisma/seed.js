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

  // Horarios reales de la iglesia
  const serviciosCount = await prisma.servicio.count();
  if (serviciosCount === 0) {
    await prisma.servicio.createMany({
      data: [
        { nombre: 'Servicio de Oración', diaSemana: 'Jueves', horaInicio: '18:30', lugar: 'Templo Principal' },
        { nombre: 'Servicio de Jóvenes (M.J.P)', diaSemana: 'Sábado', horaInicio: '18:00', lugar: 'Templo Principal' },
        { nombre: 'Ayuno', diaSemana: 'Domingo', horaInicio: '07:00', lugar: 'Templo Principal' },
        { nombre: 'Servicio General', diaSemana: 'Domingo', horaInicio: '09:00', lugar: 'Templo Principal' },
      ],
    });
    console.log('✅ Horarios de servicio creados.');
  }

  // Eventos de ejemplo — uno por categoría, para que la galería se vea completa
  const eventosCount = await prisma.evento.count();
  if (eventosCount === 0) {
    const unMesAtras = new Date();
    unMesAtras.setMonth(unMesAtras.getMonth() - 1);

    await prisma.evento.createMany({
      data: [
        { titulo: 'Cumbre Ministerial 2025', descripcion: 'Un tiempo de capacitación y renovación para todos los ministerios de la iglesia.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Cumbre Ministerial' },
        { titulo: 'Fiesta de Primicias', descripcion: 'Celebramos con gratitud las primicias que Dios nos ha dado.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Fiesta de Primicias' },
        { titulo: 'Juntos Bajo la Bendición de Dios', descripcion: 'Evento especial para parejas, un espacio para fortalecer el matrimonio a la luz de la Palabra.', fecha: unMesAtras, lugar: 'Salón Anexo', categoria: 'Juntos Bajo la Bendición de Dios' },
        { titulo: 'Acción de Gracias', descripcion: 'Un servicio especial para agradecer a Dios por su fidelidad durante el año.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Acción de Gracias' },
        { titulo: 'Campamento Kids', descripcion: 'Servicio especial del Ministerio Infantil (M.I.A) lleno de juegos, alabanza y enseñanza para los niños.', fecha: unMesAtras, lugar: 'Salón Infantil', categoria: 'Ministerio M.I.A' },
        { titulo: 'Noche de Jóvenes', descripcion: 'Servicio especial del Ministerio de Jóvenes (M.J.P).', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Ministerio M.J.P' },
        { titulo: 'Vigilia de Fin de Año', descripcion: 'Vigilia realizada por los ministerios de la iglesia para recibir el nuevo año en oración.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Vigilia' },
        { titulo: 'Celebración del Día del Padre', descripcion: 'Un homenaje especial a todos los padres de nuestra congregación.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Día del Padre' },
        { titulo: 'Celebración del Día de la Madre', descripcion: 'Un homenaje especial a todas las madres de nuestra congregación.', fecha: unMesAtras, lugar: 'Templo Principal', categoria: 'Día de la Madre' },
      ],
    });
    console.log('✅ Eventos de ejemplo creados (uno por categoría).');
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
