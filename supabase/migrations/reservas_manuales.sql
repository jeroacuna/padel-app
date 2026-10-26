-- Una reserva presencial puede no tener email
alter table reservas alter column email drop not null;

create or replace function admin_crear_reserva(
  p_fecha date, p_hora int, p_cancha int, p_nombre text, p_apellido text, p_telefono text, p_email text,
  p_origen text, p_estado text default 'confirmada', p_precio int default null, p_notas text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ahora timestamp := ahora_ar(); h_ini int; h_fin int; c canchas; nuevo uuid;
  cod text := upper(substr(md5(random()::text), 1, 6));
begin
  perform exigir_admin();
  p_nombre := btrim(coalesce(p_nombre, '')); p_apellido := btrim(coalesce(p_apellido, ''));
  p_telefono := btrim(coalesce(p_telefono, '')); p_email := nullif(btrim(coalesce(p_email, '')), '');
  if char_length(p_nombre) not between 2 and 80 then raise exception 'Revisá el nombre (entre 2 y 80 caracteres).'; end if;
  if char_length(p_apellido) > 80 then raise exception 'El apellido es demasiado largo.'; end if;
  if p_telefono <> '' and p_telefono !~ '^[0-9+()[:space:]-]{6,25}$' then raise exception 'Revisá el teléfono.'; end if;
  if p_email is not null and (char_length(p_email) > 120 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Revisá el email.';
  end if;
  if p_origen not in ('whatsapp', 'telefono', 'presencial') then raise exception 'Origen inválido.'; end if;
  if p_estado not in ('pendiente', 'confirmada') then raise exception 'Estado inicial inválido.'; end if;
  if p_precio is not null and p_precio not between 0 and 1000000 then raise exception 'Precio inválido.'; end if;
  select coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_inicio'), 9),
         coalesce((select (valor #>> '{}')::int from config_complejo where clave = 'hora_fin'), 22) into h_ini, h_fin;
  if p_hora not between h_ini and h_fin then raise exception 'Ese horario está fuera del horario de atención.'; end if;
  -- el administrador puede anotar el turno de la hora en curso (alguien que llegó ahora)
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora < extract(hour from ahora)::int) then
    raise exception 'Ese turno ya pasó.';
  end if;
  select * into c from canchas where id = p_cancha and activa;
  if not found then raise exception 'La cancha no está disponible.'; end if;
  insert into reservas (codigo, fecha, hora, cancha_id, nombre, apellido, telefono, email, precio, origen, estado, notas)
  values (cod, p_fecha, p_hora, p_cancha, p_nombre, p_apellido, p_telefono, p_email, coalesce(p_precio, c.precio),
          p_origen, p_estado, left(nullif(btrim(coalesce(p_notas, '')), ''), 300))
  returning id into nuevo;
  perform registrar_auditoria('reservas', nuevo::text, 'crear_manual',
    jsonb_build_object('origen', p_origen, 'estado', p_estado, 'precio', coalesce(p_precio, c.precio)));
  return nuevo;
exception when unique_violation then
  raise exception 'Ese turno ya está ocupado por otra reserva.';
end $$;

revoke execute on function admin_crear_reserva(date, int, int, text, text, text, text, text, text, int, text) from public, anon, authenticated;
grant execute on function admin_crear_reserva(date, int, int, text, text, text, text, text, text, int, text) to authenticated;