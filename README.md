# JOXE

Sistema web para gestión de salón/barbería con varios portales en React + Babel, servido como sitio estático y respaldado por funciones API.

## Qué incluye

- **Admin portal**: panel de gestión, agenda, CRM, caja, empleados, servicios y bloqueos.
- **Portal público**: página de acceso y navegación general.
- **Booking**: flujo de reservas para clientes.
- **Check-in / Lobby / Scan**: acceso y control operativo en sala.
- **Mi Cuenta**: el cliente entra solo con su cédula, sin contraseña. Como la cédula no es un dato secreto, la protección no está en la llave sino en lo que se entrega: la respuesta se arma campo por campo y deja fuera el celular, la cédula, el precio cobrado y las notas internas del equipo.
- **Staff portal**: acceso de empleados.
- **PWA**: manifiesto y service worker para experiencia instalable.
- **Academia**: página pública de las clases de barbería en `/academia`, con cursos, temario, preguntas frecuentes y formulario de inscripción. El contenido se edita desde el panel (Admin → Academia) y nace apagado: mientras no se publique, la página no muestra cursos y el enlace no aparece ni en el menú ni en el home. Las solicitudes llegan a la bandeja del panel y avisan al equipo.
- **Reseñas**: calificaciones de clientes con cita completada, moderadas desde el panel y publicadas en el home. Hay tres formas de llegar al formulario: el link firmado que envía el salón, el botón "Deja tu reseña" en Mi Cuenta, y la página `/resena` abierta directamente, donde el cliente solo escribe su cédula. En ese caso se busca su visita completada más reciente sin reseñar (últimos 30 días) y se muestra el nombre enmascarado ("Ana M••• P•••") para que confirme que el registro es suyo. El nombre completo nunca sale del servidor: al formulario solo viaja el nombre de pila, que es lo único que se publica.
- **Copia de seguridad**: en Admin → Configuración se descarga la base de datos completa en un archivo JSON y se restaura desde él. Toda la información vive en una sola tabla (`kv`), así que ese archivo basta para reconstruir el sistema desde cero: citas, clientes, caja, reseñas, academia, equipo y configuración. Al restaurar hay dos caminos: *restauración completa*, que deja la base exactamente como el archivo y descarta todo lo cargado después, y *combinar*, que sobrescribe solo las claves presentes en el archivo. El archivo también se puede descargar desde fuera del panel con `GET /api/backup` usando el `CRON_SECRET`, para respaldos automáticos.
- **Galería de trabajos**: la sección "Trabajos reales" del home no se pinta mientras `GALLERY_CASES` (`components.jsx`) esté vacía, y con ella desaparecen sus enlaces del menú, del hero y del footer. Solo se llena con casos reales del salón y con permiso del cliente: cada caso lleva título, servicio, estilista y las fotos de antes y después.
- **Temas de temporada**: decoraciones animadas para el home (por ahora Halloween) que se manejan desde Admin → Configuración → Temas de temporada. Cada tema tiene tres modos: *automático* (se enciende solo cada año en su temporada, contada en hora de Colombia; Halloween va del 1 al 31 de octubre), *encendido* y *apagado*. Se muestra uno a la vez y el encendido a mano gana sobre los automáticos. Para ver un tema sin tocar la configuración: `/?tema=halloween`.

## Nombres de personas

Los nombres solo admiten letras (con tildes y ñ), espacios, apóstrofo y guion.
Números, emojis y símbolos se descartan mientras se escribe y se rechazan en el
servidor. Aplica a reservas, reseñas, inscripciones de la academia y a los
campos de nombre del panel (clientes y equipo).

La regla vive en `cleanName` / `nameError` (`lib/db.js`) y está replicada en el
front (`portal.jsx`, `resena.jsx`, `academia.jsx`, `admin.jsx`), que se cargan
sueltos en el navegador y no comparten bundler. Si cambia la regla, hay que
cambiarla en los dos lados.

## Celulares

Todo campo de celular (reserva, "Reservar turno" del Staff, inscripción de la
Academia y los números de WhatsApp de Configuración) tiene una lista de países
con bandera e indicativo, con Colombia por defecto. Los celulares de clientes
se guardan en formato E.164: `+573001234567`.

Las citas anteriores tienen 10 dígitos sin indicativo (`3001234567`). No se
migraron: todas eran de celulares colombianos y se leen como +57. Para
reconocer al mismo cliente (CRM, autocompletar el nombre en el Staff) se usa
`phoneKey`, que para Colombia sigue siendo esos 10 dígitos, así que las fichas
viejas y las nuevas coinciden.

El campo y las reglas viven en `telefono.jsx`, que cargan todas las páginas que
piden o muestran un celular. El servidor repite la normalización y la
validación en `normPhone` / `phoneError` (`lib/db.js`); si cambia la regla, hay
que cambiarla en los dos lados. En Windows, que no dibuja banderas con emoji,
se carga una fuente solo de banderas desde jsDelivr.

## Movimiento del home

La portada muestra lo que dice su titular ("La imagen no se improvisa. Se
diseña."): el hero es un croquis de corte que se dibuja solo (tercios del
rostro, línea de degradado, silueta del pelo) con una guía de elevación que el
visitante mueve con el cursor; en celular se pasea sola. El resto de la página
usa el mismo lenguaje: trazos de bronce que se dibujan, titulares que suben
línea por línea, precios que ruedan como un odómetro y una cinta métrica con
los servicios que se acelera con el scroll. En escritorio, la sección de
servicios tiene una ficha fija que muestra el servicio que se está leyendo o
apuntando (duración, precio y, si hoy es martes en Colombia, el precio del día).

- `movimiento/logica.js`: geometría del croquis, odómetro, fila activa y día en hora de Colombia. Sin DOM; se prueba con `npm test`.
- `movimiento/motor.js`: enlaza por atributos `data-mv` las entradas con scroll (GSAP 3.15 y ScrollTrigger desde cdnjs, con SRI).
- `movimiento/piezas.jsx`: el croquis, el odómetro y la ficha de servicios.

El marcado es siempre el estado final. Si GSAP no carga o el visitante tiene
activado "reducir movimiento", la página se ve completa y quieta; el motor solo
esconde lo que va a animar y, si algo falla, lo devuelve a la vista. Las
animaciones se detienen fuera de pantalla. Solo el home carga estos archivos:
`/academia` comparte `components.jsx` pero no el motor.

## Estructura principal

- `Admin.html` / `admin.jsx` — panel administrativo.
- `Portal.html` / `portal.jsx` — portal general.
- `Booking.html` — reservas de clientes.
- `CheckIn.html`, `Lobby.html`, `Scan.html` — operación en salón.
- `Staff.html` — acceso del equipo.
- `Payment.html`, `Cuenta.html`, `Showcase.html`, `Agenda.html` — vistas auxiliares.
  Mi Cuenta (`Cuenta.html`) no usa contraseña: el cliente entra con su cédula más los últimos 4 dígitos del celular con el que reservó.
- `Resena.html` / `resena.jsx` — reseña del cliente: identificación por cédula o entrada directa con link firmado.
- `Academia.html` / `academia.jsx` — página pública de las clases.
- `movimiento/`: croquis del hero, motor de animación y su lógica con pruebas (ver "Movimiento del home").
- `temas/`: biblioteca de temas de temporada. `catalogo.js` lista cada tema con su temporada y su archivo, `cargador.js` decide en el sitio cuál mostrar y cada tema vive en su propio script (`halloween.js`). Para sumar uno nuevo basta crear su archivo y agregarlo a `catalogo.js`.
- `telefono.jsx`: campo de celular con indicativo y reglas para guardar, comparar y mostrar números (ver "Celulares").
- `api/` — funciones backend.
- `lib/` — utilidades compartidas.
- `manifest.json` y `sw.js` — soporte PWA.

## Backend / API

Rutas disponibles en `api/`:

- `academy.js`
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
- `/academia` → `Academia.html`
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
