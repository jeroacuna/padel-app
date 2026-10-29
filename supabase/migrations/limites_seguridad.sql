

insert into config_complejo (clave, valor) values ('max_reservas_activas', '4') on conflict (clave) do nothing;

create or replace function crear_reserva(p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text,
  p_telefono text, p_email text, p_precio int) returns text
language plpgsql security definer set search_path = public as $$
declare
  cod text := upper(substr(md5(random()::text), 1, 6)); ahora timestamp := ahora_ar(); h_ini int; h_fin int; c canchas; activas int;
  maxres int := coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'max_reservas_activas'), 4);
begin
  perform validar_contacto(p_nombre, p_telefono, p_email);
  if p_apellido is null or char_length(btrim(p_apellido)) not between 2 and 80 then raise exception 'Revisá el apellido.'; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then raise exception 'Ese turno ya pasó.'; end if;
  select * into c from canchas where id = p_cancha and activa;
  if not found then raise exception 'La cancha no está disponible.'; end if;
  if slot_bloqueado(p_fecha, p_hora, p_cancha) then raise exception 'La cancha no está disponible en ese horario.'; end if;

  -- Límite por persona: se cuentan las reservas próximas que siguen vigentes con el mismo teléfono o email
  select count(*) into activas from reservas r
   where r.estado in ('pendiente', 'confirmada')
     and (r.fecha > ahora::date or (r.fecha = ahora::date and r.hora >= extract(hour from ahora)::int))
     and ((norm_tel(p_telefono) is not null and norm_tel(r.telefono) = norm_tel(p_telefono))
          or lower(coalesce(r.email, '')) = lower(btrim(p_email)));
  if activas >= maxres then
    raise exception 'Ya tenés % reservas próximas. Cancelá alguna desde "Mi reserva" o escribinos por WhatsApp.', activas;
  end if;

  insert into reservas (codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio)
  values (cod, p_fecha, p_hora, p_cancha, btrim(p_nombre), btrim(p_apellido), btrim(p_telefono), btrim(p_email), c.precio);
  return cod;
exception when unique_violation then
  raise exception 'Ese turno ya fue reservado. Elegí otro.';
end $$;