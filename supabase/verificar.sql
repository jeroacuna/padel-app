
select table_name, string_agg(privilege_type, ', ') as permisos
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public' group by 1 order by 1;

-- Esperado: reservas_turno_unico (índice parcial) y SIN la restricción vieja.
select indexname, indexdef from pg_indexes where tablename = 'reservas';

-- Esperado: columnas nuevas de reservas (estado, pago_estado, origen, notas, updated_at).
select column_name, column_default from information_schema.columns where table_name = 'reservas' order by ordinal_position;

-- Esperado: las 5 funciones públicas + es_admin + rol_admin.
select routine_name from information_schema.routines where routine_schema = 'public' order by 1;