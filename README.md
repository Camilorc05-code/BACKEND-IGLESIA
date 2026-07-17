# Backend — Misión Panamericana

API para el sitio web de la iglesia. Node.js, Express, Prisma y PostgreSQL (Supabase).

## Qué maneja

- **Auth**: login con JWT. Tres roles: ADMIN, PASTOR, LIDER.
- **Personas**: base de datos de feligreses con búsqueda y paginación.
- **Servicios**: horarios de cultos. Lectura pública, edición solo staff.
- **Eventos**: próximos y pasados, con galería de fotos. Lectura pública, edición staff.
- **Citas**: cualquier visitante agenda cita con un pastor. Staff confirma o cancela desde el panel.
- **Usuarios**: crear, activar/desactivar y eliminar usuarios del sistema (solo ADMIN).

## Configurar la BD en Supabase

1. Crear cuenta en https://supabase.com (se puede con GitHub, gratis).
2. New Project → nombre y contraseña para la DB.
3. Esperar a que esté listo (~2 min).
4. Ir a Settings → Database → Connection string → URI. Copiar la cadena y reemplazar `[YOUR-PASSWORD]`.
5. Para producción usar el connection pooling (puerto 6543).

## Correr local

```bash
cp .env.example .env
# Llenar DATABASE_URL con la URI de Supabase y generar JWT_SECRET

npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Para generar un JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

El seed crea un usuario admin:
- Email: `admin@misionpanamericana.com`
- Password: `admin`

## Desplegar en Render

1. Subir el código a GitHub.
2. En https://render.com → New → Web Service → conectar el repo.
3. Build Command: `npm install && npx prisma generate`
4. Start Command: `npx prisma migrate deploy && npm start`
5. En Environment Variables agregar DATABASE_URL, JWT_SECRET y FRONTEND_URL.
6. Deploy.

El plan free duerme el servicio después de 15 min sin tráfico. Tarda unos 30-50 segundos en despertar.

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | No | Login |
| POST | `/api/auth/usuarios` | ADMIN | Crear usuario |
| GET | `/api/auth/usuarios` | ADMIN | Listar usuarios |
| PUT | `/api/auth/usuarios/:id/toggle` | ADMIN | Activar/desactivar |
| DELETE | `/api/auth/usuarios/:id` | ADMIN | Eliminar usuario |
| GET | `/api/personas` | Sí | Listar personas |
| POST | `/api/personas` | Sí | Crear persona |
| GET | `/api/servicios` | No | Horarios públicos |
| POST | `/api/servicios` | ADMIN/PASTOR | Crear horario |
| GET | `/api/eventos` | No | Eventos |
| POST | `/api/citas` | No | Agendar cita |
| GET | `/api/citas` | Sí | Ver citas |
| PUT | `/api/citas/:id/estado` | Sí | Cambiar estado cita |
