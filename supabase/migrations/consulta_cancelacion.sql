-- 008 · Fase 6 · Consulta de reserva con código, cancelación por el cliente y emails
-- Qué hace: el cliente puede consultar su reserva con (código + email o teléfono) y cancelarla hasta X horas antes
-- (por defecto 24, configurable en config_complejo.horas_cancelacion). Agrega los marcadores para no repetir emails.
-- Correr UNA vez, después de 007. No borra datos.

/* ============ 1) COLUMNAS Y CONFIGURACIÓN ============ */
alter table reservas add column if not exists email_enviado boolean not null default false;
alter table reservas add column if not exists email_cancelacion_enviado boolean not null default false;
alter table inscripciones add column if not exists email_enviado boolean not null default false;

-- Horas de anticipación mínimas para cancelar (se puede cambiar desde el Table Editor)
insert into config_complejo (clave, valor) values ('horas_cancelacion', '24') on conflict (clave) do nothing;

/* ============ 2) CONTROL DE INTENTOS FALLIDOS ============ */
-- Guarda los intentos con datos incorrectos para frenar a quien pruebe códigos al azar.
create table if not exists consultas_fallidas (
  id bigserial primary key,
  clave text not null,                          -- email (en minúscula) o teléfono normalizado que se probó
  created_at timestamptz not null default now()
);
create index if not exists consultas_fallidas_idx on consultas_fallidas (clave, created_at desc);
alter table consultas_fallidas enable row level security;
revoke all on consultas_fallidas from anon, authenticated;

/* ============ 3) BUSCAR LA RESERVA (interna) ============ */
-- Devuelve la reserva solo si el código coincide Y el contacto (email o teléfono) es el de la reserva.
-- No usa "raise exception" al fallar para que el intento quede registrado (un error deshace el insert).
create or replace function buscar_reserva_cliente(p_codigo text, p_contacto text) returns reservas
language plpgsql security definer set search_path = public as $$
declare cod text := upper(btrim(coalesce(p_codigo, ''))); con text := btrim(coalesce(p_contacto, '')); k text; fallos int; r reservas;
begin
  k := case when position('@' in con) > 0 then lower(con) else coalesce(norm_tel(con), con) end;
  delete from consultas_fallidas where created_at < now() - interval '1 day';
  select count(*) into fallos from consultas_fallidas where clave = k and created_at > now() - interval '15 minutes';
  if fallos >= 8 then raise exception 'Hiciste demasiados intentos. Probá de nuevo en 15 minutos.'; end if;

  if cod ~ '^[A-Z0-9]{6}$' and char_length(con) >= 5 then
    select * into r from reservas
     where codigo = cod
       and ((position('@' in con) > 0 and lower(coalesce(email, '')) = lower(con))
         or (position('@' in con) = 0 and norm_tel(telefono) is not null and norm_tel(telefono) = norm_tel(con)))
     limit 1;
    if found then return r; end if;
  end if;
  insert into consultas_fallidas (clave) values (k);
  return null;
end $$;

/* ============ 4) CONSULTAR ============ */
create or replace function consultar_reserva(p_codigo text, p_contacto text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; c canchas; ahora timestamp := ahora_ar(); horas int; inicio timestamp; puede boolean; motivo text;
begin
  r := buscar_reserva_cliente(p_codigo, p_contacto);
  if r.id is null then
    return jsonb_build_object('ok', false, 'mensaje', 'No encontramos una reserva con esos datos. Revisá el código y el email o teléfono con el que reservaste.');
  end if;
  select * into c from canchas where id = r.cancha_id;
  horas := coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'horas_cancelacion'), 24);
  inicio := r.fecha + make_interval(hours => r.hora);
  puede := r.estado in ('pendiente', 'confirmada') and inicio - ahora >= make_interval(hours => horas);
  motivo := case
    when r.estado = 'cancelada' then 'Esta reserva ya está cancelada.'
    when r.estado = 'completada' then 'Esta reserva ya se jugó.'
    when not puede then format('Solo se puede cancelar hasta %s hs antes del turno. Escribinos por WhatsApp y lo vemos.', horas)
  end;
  return jsonb_build_object('ok', true, 'codigo', r.codigo, 'fecha', r.fecha, 'hora', r.hora, 'cancha', c.nombre, 'tipo', c.tipo,
    'estado', r.estado, 'nombre', r.nombre, 'precio', r.precio, 'pago_estado', r.pago_estado,
    'puede_cancelar', puede, 'motivo', motivo, 'horas_cancelacion', horas);
end $$;

/* ============ 5) CANCELAR ============ */
create or replace function cancelar_reserva_cliente(p_codigo text, p_contacto text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r reservas; ahora timestamp := ahora_ar(); horas int; inicio timestamp; nota text := left(btrim(coalesce(p_motivo, '')), 300);
begin
  r := buscar_reserva_cliente(p_codigo, p_contacto);
  if r.id is null then
    return jsonb_build_object('ok', false, 'mensaje', 'No encontramos una reserva con esos datos.');
  end if;
  select * into r from reservas where id = r.id for update;
  if r.estado not in ('pendiente', 'confirmada') then
    return jsonb_build_object('ok', false, 'mensaje', 'Esta reserva ya no se puede cancelar.');
  end if;
  horas := coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'horas_cancelacion'), 24);
  inicio := r.fecha + make_interval(hours => r.hora);
  if inicio - ahora < make_interval(hours => horas) then
    return jsonb_build_object('ok', false, 'mensaje', format('Solo se puede cancelar hasta %s hs antes del turno. Escribinos por WhatsApp y lo vemos.', horas));
  end if;
  update reservas set estado = 'cancelada', updated_at = now(),
         notas = concat_ws(E'\n', notas, '[' || to_char(ahora, 'DD/MM HH24:MI') || '] Cancelada por el cliente desde la web' || case when nota <> '' then ': ' || nota else '' end)
   where id = r.id;
  perform registrar_auditoria('reservas', r.id::text, 'cambiar_estado',
    jsonb_build_object('de', r.estado, 'a', 'cancelada', 'nota', 'Cancelada por el cliente desde la web'));
  return jsonb_build_object('ok', true, 'codigo', r.codigo, 'reembolso_pendiente', r.pago_estado in ('parcial', 'pagado'));
end $$;

/* ============ 6) PERMISOS ============ */
revoke execute on function buscar_reserva_cliente(text, text), consultar_reserva(text, text), cancelar_reserva_cliente(text, text, text) from public, anon, authenticated;
grant execute on function consultar_reserva(text, text), cancelar_reserva_cliente(text, text, text) to anon, authenticated;