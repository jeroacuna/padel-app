# Padel Arena

Web de gestión de un complejo de pádel: reservas de canchas, torneos, clases con profesores y avisos.
Proyecto final de Práctica Profesionalizante (carrera Full Stack).

**Stack:** HTML + CSS + JavaScript vanilla · Supabase (Postgres, RLS, funciones RPC, Edge Functions) · Resend (emails).

## Estructura
```
index.html, torneos.html, profesores.html   páginas públicas
reserva.html                                consulta y cancelación de una reserva con código
css/  js/  assets/                          estilos, lógica y recursos
supabase/migrations/                        estructura de la base (correr en orden, una vez cada una)
supabase/functions/enviar-email/            Edge Function de emails (Resend)
supabase/seed_demo.sql                      datos de ejemplo (opcional)
supabase/verificar.sql                      consultas para comprobar la base
supabase/crear_admin.sql                    crea el primer administrador
admin/                                      panel de administración (login, layout, módulos)
supabase/legacy/                            scripts viejos (referencia, ya reemplazados por las migraciones)
docs/                                       pruebas, despliegue, manual del panel y arquitectura
vercel.json                                 cabeceras de seguridad (Vercel)
ROADMAP.md                                  avance del proyecto
```

## Puesta en marcha
1. Abrir con un servidor local (Live Server de VS Code).
2. Crear un proyecto en Supabase y correr las migraciones de `supabase/migrations/` en orden, en el SQL Editor.
3. Pegar la URL y la clave **pública** (publishable/anon) en `js/supabase.js`. Nunca la `service_role` ni la `secret`.
4. Opcional: correr `seed_demo.sql` para tener datos de ejemplo.

## Documentación
- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): cómo está armado y por qué (seguridad, modelo de datos, decisiones).
- [`docs/DEPLOY.md`](docs/DEPLOY.md): puesta en producción en Supabase y Vercel, y checklist de salida.
- [`docs/PRUEBAS.md`](docs/PRUEBAS.md): plan de pruebas manuales. `supabase/verificar.sql` comprueba la base.
- [`docs/MANUAL_ADMIN.md`](docs/MANUAL_ADMIN.md): guía del panel para quien administra el complejo.

## Modos de la app
- **Producción (por defecto):** usa Supabase. Si no hay conexión, la web lo avisa y **no guarda nada en el navegador**.
- **Demo:** datos locales de ejemplo que nunca tocan la base real. Se activa con `modo: 'demo'` en `js/config.js`
  o entrando con `?demo=1` (se apaga con `?demo=0`). Muestra un cartel naranja "MODO DEMO".

## Panel de administración
- Entrada: `/admin/` (login con email y contraseña de Supabase Auth). Solo entran usuarios que estén en la tabla `perfiles_admin`.
- Primer administrador: crear el usuario en Supabase (Authentication → Users) y correr `supabase/crear_admin.sql`.
- Recomendado: desactivar el registro público en Authentication ("Allow new users to sign up").
- El panel no funciona en modo demo ni sin conexión.
- Permite gestionar: dashboard, reservas, calendario, canchas y bloqueos, clientes, pagos y estadísticas, torneos e inscripciones,
  profesores y clases, avisos y el horario de atención. Todo cambio queda en el historial (auditoría).
- Roles: el **propietario** (`owner`) puede además anular pagos y cambiar el horario de atención; el **staff** gestiona el día a día.

## Qué se edita desde dónde
- Desde el **panel**: canchas y precios, bloqueos, reservas, clientes, pagos, torneos, profesores, avisos y horario de atención.
- Desde **`js/config.js`**: datos del complejo (teléfono, dirección, Instagram, WhatsApp), fotos, textos de servicios y testimonios.

## Emails (Edge Function `enviar-email`)
- Avisa al dueño cuando hay una reserva, una inscripción a torneo, una clase o una cancelación del cliente.
- Desplegar: `supabase functions deploy enviar-email`. Secrets: `RESEND_API_KEY`, `MAIL_DESTINO` (obligatorios), `MAIL_FROM`, `LOGO_URL`,
  `PUBLIC_URL` (link "Ver o cancelar mi reserva"), `PAGO_ALIAS`, `PAGO_TITULAR` (opcionales).
- Confirmación al cliente: poner `ENVIAR_A_CLIENTES=true`. Requiere un dominio verificado en Resend (con `onboarding@resend.dev` solo llega a tu propio mail).
- Plazo de cancelación: `config_complejo.horas_cancelacion` (24 por defecto).

## Seguridad (resumen)
- Las tablas con datos personales (`reservas`, `inscripciones`, `clases`) tienen RLS y **ningún acceso directo** para visitantes.
- El navegador solo puede usar funciones concretas (`crear_reserva`, `inscribir`, `consultar_reserva`, `cancelar_reserva_cliente`, ...) que validan todo en el servidor.
- La consulta de reservas exige código + email o teléfono, y se bloquea tras 8 intentos fallidos en 15 minutos.
- Una misma persona no puede tener más de 4 reservas próximas activas desde la web (`config_complejo.max_reservas_activas`).
- Precio, horarios, fechas pasadas y datos de contacto se validan en la base, no en el navegador.
- El panel escribe siempre mediante funciones `admin_*` que comprueban el rol, validan los datos y registran quién hizo cada cambio.