# JOXE

Sistema web para gestión de salón/barbería con varios portales en React + Babel, servido como sitio estático y respaldado por funciones API.

## Qué incluye

- **Admin portal**: panel de gestión, agenda, CRM, caja, empleados, servicios y bloqueos.
- **Portal público**: página de acceso y navegación general.
- **Booking**: flujo de reservas para clientes.
- **Check-in / Lobby / Scan**: acceso y control operativo en sala.
- **Staff portal**: acceso de empleados.
- **PWA**: manifiesto y service worker para experiencia instalable.
- **Reseñas**: calificaciones de clientes con cita completada, moderadas desde el panel y publicadas en el home. El cliente llega al formulario desde el link que envía el salón o desde el botón "Deja tu reseña" en Mi Cuenta.

## Estructura principal

- `Admin.html` / `admin.jsx` — panel administrativo.
- `Portal.html` / `portal.jsx` — portal general.
- `Booking.html` — reservas de clientes.
- `CheckIn.html`, `Lobby.html`, `Scan.html` — operación en salón.
- `Staff.html` — acceso del equipo.
- `Payment.html`, `Cuenta.html`, `Showcase.html`, `Agenda.html` — vistas auxiliares.
- `Resena.html` / `resena.jsx` — formulario de reseña del cliente (solo con link firmado).
- `api/` — funciones backend.
- `lib/` — utilidades compartidas.
- `manifest.json` y `sw.js` — soporte PWA.

## Backend / API

Rutas disponibles en `api/`:

- `admin.js`
- `agenda.js`
- `backup.js`
- `book.js`
- `catalog.js`
- `client.js`
- `crm.js`
- `payment.js`
- `push.js`
- `reminders.js`
- `reviews.js`
- `store.js`
- `work-hours.js`

## Despliegue

El proyecto está preparado para Vercel con rewrites definidos en `vercel.json`.

### Rutas principales

- `/admin` → `Admin.html`
- `/staff` → `Staff.html`
- `/agenda` → `Agenda.html`
- `/portal` → `Portal.html`
- `/booking` → `Booking.html`
- `/checkin` → `CheckIn.html`
- `/scan` → `Scan.html`
- `/lobby` → `Lobby.html`
- `/cuenta` → `Cuenta.html`
- `/showcase` → `Showcase.html`
- `/resena` → `Resena.html`
- `/` → `Asesores de Imagen.html`

## Tecnologías

- React 18 vía CDN
- Babel Standalone para JSX en navegador
- JavaScript modular
- Vercel Functions
- `@libsql/client`
- `web-push`

## Requisitos

- Un entorno capaz de servir archivos estáticos.
- Variables de entorno o configuración necesaria para las funciones en `api/`.

## Uso local

Abre el HTML correspondiente según la sección que quieras probar, o sirve el proyecto como sitio estático para que las rutas y APIs funcionen correctamente.

## Nota

El panel usa almacenamiento local como caché y sincroniza datos con las APIs del backend.
