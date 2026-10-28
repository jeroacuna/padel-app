# Roadmap · Padel Arena

Panel de administración y web pública de un complejo de pádel. Stack: HTML + CSS + JS vanilla (módulos ES), Supabase (Postgres, RLS, RPC, Edge Functions) y Resend para emails.

## Hecho

| Fase | Contenido | Migración |
|------|-----------|-----------|
| 1A | Fundaciones: estados, roles, índice único parcial, hora argentina, validaciones | `fundaciones.sql` |
| 1B | Login real del panel, protección de rutas, diseño base | `admin_*` |
| 2 | Dashboard, reservas, calendario, reservas manuales, auditoría | `admin_reservas.sql`, `reservas_manuales.sql` |
| 3 | Canchas, bloqueos (lluvia, mantenimiento, eventos), clientes sin duplicados | `canchas_clientes.sql` |
| 4 | Pagos (cobros, reembolsos, anulaciones), finanzas y estadísticas | `pagos_estadisticas.sql` (006) |
| 5 | Torneos e inscripciones, profesores y clases, avisos, horario de atención dinámico | `torneos_profesores_config.sql` (007) |
| 6 | Consulta de reserva con código (`reserva.html`), cancelación por el cliente hasta 24 hs antes, emails de reservas, inscripciones y cancelaciones | `consulta_cancelacion.sql` (008) + Edge Function `enviar-email` |

## Pendiente

- **Fase 7:** pruebas, accesibilidad, SEO (reemplazar `TU-DOMINIO` en canonical, og:url, JSON-LD, sitemap), despliegue y documentación.

## Después del núcleo

Reservas fijas, lista de espera, promociones y ranking.

## Decisiones de diseño

- Las tablas con datos personales no tienen acceso directo para visitantes: todo pasa por funciones SQL que validan en el servidor.
- El panel escribe siempre con funciones `admin_*` (security definer) que verifican `es_admin()`, validan los datos y dejan registro en `auditoria`.
- Nada se borra: canchas, profesores, torneos y avisos se ocultan o desactivan; reservas, clases e inscripciones se cancelan. Se conserva el historial.
- Cuando un cambio deja reservas o clases afectadas (bloqueo, profesor desactivado, nuevo horario), el sistema avisa cuántas son pero no cancela nada solo.