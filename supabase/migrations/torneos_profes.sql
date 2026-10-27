
create or replace function sin_html(p text) returns text language plpgsql immutable as $$
begin
  if p ~ '[<>]' then raise exception 'No uses los símbolos < ni > en los textos.'; end if;
  return p;
end $$;


create or replace function lista_limpia(p text[], p_max int, p_largo int, p_nombre text) returns text[]
language plpgsql immutable as $$
declare r text[];
begin
  select coalesce(array_agg(sin_html(btrim(t.x)) order by t.i), '{}') into r
    from unnest(coalesce(p, '{}')) with ordinality as t(x, i) where btrim(t.x) <> '';
  if coalesce(array_length(r, 1), 0) > p_max then raise exception 'Demasiados elementos en % (máximo %).', p_nombre, p_max; end if;
  if exists (select 1 from unnest(r) y where char_length(y) > p_largo) then
    raise exception 'Hay un elemento demasiado largo en % (máximo % caracteres).', p_nombre, p_largo;
  end if;
  return r;
end $$;


alter table torneos add column if not exists estado text not null default 'abierto';
alter table torneos add column if not exists publicado boolean not null default true;   -- los torneos que ya existen siguen visibles
alter table profesores add column if not exists activo boolean not null default true;
alter table clases add column if not exists estado text not null default 'confirmada';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'torneos_estado_chk') then
    alter table torneos add constraint torneos_estado_chk check (estado in ('abierto', 'cerrado', 'finalizado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clases_estado_chk') then
    alter table clases add constraint clases_estado_chk check (estado in ('confirmada', 'cancelada'));
  end if;
end $$;


alter table clases drop constraint if exists clases_profesor_id_fecha_hora_key;
create unique index if not exists clases_turno_unico on clases (profesor_id, fecha, hora) where estado <> 'cancelada';


drop policy if exists "torneos públicos" on torneos;
create policy "torneos públicos" on torneos for select using (publicado);
drop policy if exists "admins ven torneos" on torneos;
create policy "admins ven torneos" on torneos for select to authenticated using (es_admin());

drop policy if exists "profesores públicos" on profesores;
create policy "profesores públicos" on profesores for select using (activo);
drop policy if exists "admins ven profesores" on profesores;
create policy "admins ven profesores" on profesores for select to authenticated using (es_admin());

drop policy if exists "admins ven avisos" on avisos;
create policy "admins ven avisos" on avisos for select to authenticated using (es_admin());

drop policy if exists "admins ven inscripciones" on inscripciones;
create policy "admins ven inscripciones" on inscripciones for select to authenticated using (es_admin());
drop policy if exists "admins ven clases" on clases;
create policy "admins ven clases" on clases for select to authenticated using (es_admin());
grant select on inscripciones, clases to authenticated;

-- La vista pública solo muestra torneos publicados (se recrea para incluir las columnas nuevas)
drop view if exists torneos_info;
create view torneos_info as
  select t.*, (select count(*)::int from inscripciones i where i.torneo_id = t.id and i.estado <> 'cancelada') as inscriptos
  from torneos t where t.publicado;
grant select on torneos_info to anon, authenticated;


create or replace function clases_ocupadas(p_prof int, p_fecha date) returns table(hora int)
language sql security definer set search_path = public as
$$ select c.hora from clases c where c.profesor_id = p_prof and c.fecha = p_fecha and c.estado <> 'cancelada' $$;

create or replace function inscribir(p_torneo int, p_categoria text, p_j1 text, p_j2 text, p_tel text, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare t torneos; n int; cod text := upper(substr(md5(random()::text), 1, 6));
begin
  perform validar_contacto(p_j1, p_tel, p_email);
  if p_j2 is null or char_length(btrim(p_j2)) not between 2 and 80 then raise exception 'Revisá el nombre del jugador 2.'; end if;
  select * into t from torneos where id = p_torneo for update;
  if not found or not t.publicado then raise exception 'El torneo no existe.'; end if;
  if t.estado <> 'abierto' then raise exception 'La inscripción a este torneo está cerrada.'; end if;
  if not (p_categoria = any (t.categorias)) then raise exception 'Categoría inválida.'; end if;
  if exists (select 1 from inscripciones where torneo_id = p_torneo and categoria = p_categoria
             and lower(email) = lower(btrim(p_email)) and estado <> 'cancelada') then
    raise exception 'Ya hay una inscripción con ese email en esta categoría.';
  end if;
  select count(*) into n from inscripciones where torneo_id = p_torneo and estado <> 'cancelada';
  if n >= t.cupos then raise exception 'Los cupos de este torneo están completos.'; end if;
  insert into inscripciones (codigo, torneo_id, categoria, jugador1, jugador2, telefono, email)
  values (cod, p_torneo, p_categoria, btrim(p_j1), btrim(p_j2), btrim(p_tel), btrim(p_email));
  return cod;
end $$;

create or replace function reservar_clase(p_prof int, p_fecha date, p_hora int, p_nombre text, p_telefono text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6)); p profesores; ahora timestamp := ahora_ar();
begin
  perform validar_contacto(p_nombre, p_telefono, p_email);
  if p_fecha < ahora::date or (p_fecha = ahora::date and p_hora <= extract(hour from ahora)::int) then raise exception 'Ese horario ya pasó.'; end if;
  select * into p from profesores where id = p_prof;
  if not found or not p.activo then raise exception 'El profesor no está disponible.'; end if;
  if not coalesce((p.horarios -> (extract(dow from p_fecha)::int)::text) @> to_jsonb(p_hora), false) then
    raise exception 'El profe no da clases en ese horario.';
  end if;
  insert into clases (codigo, profesor_id, fecha, hora, nombre, telefono, email)
  values (cod, p_prof, p_fecha, p_hora, btrim(p_nombre), btrim(p_telefono), btrim(p_email));
  return cod;
exception when unique_violation then
  raise exception 'Ese horario ya fue reservado. Elegí otro.';
end $$;


create or replace function admin_guardar_torneo(
  p_id int, p_titulo text, p_fecha date, p_hora text, p_lugar text, p_categorias text[], p_precio int, p_cupos int,
  p_descripcion text, p_formato text, p_premios text[], p_reglamento text[], p_imagen text, p_estado text, p_publicado boolean
) returns int language plpgsql security definer set search_path = public as $$
declare tid int := p_id; antes torneos; activas int; cats text[]; prem text[]; regl text[];
begin
  perform exigir_admin();
  p_titulo := sin_html(btrim(coalesce(p_titulo, '')));
  p_lugar := sin_html(btrim(coalesce(p_lugar, '')));
  p_descripcion := sin_html(nullif(btrim(coalesce(p_descripcion, '')), ''));
  p_formato := sin_html(nullif(btrim(coalesce(p_formato, '')), ''));
  p_imagen := nullif(btrim(coalesce(p_imagen, '')), '');
  cats := lista_limpia(p_categorias, 10, 30, 'las categorías');
  prem := lista_limpia(p_premios, 10, 120, 'los premios');
  regl := lista_limpia(p_reglamento, 20, 200, 'el reglamento');
  if char_length(p_titulo) not between 3 and 80 then raise exception 'El título debe tener entre 3 y 80 caracteres.'; end if;
  if char_length(p_lugar) not between 3 and 120 then raise exception 'Indicá el lugar (entre 3 y 120 caracteres).'; end if;
  if p_fecha is null then raise exception 'Indicá la fecha del torneo.'; end if;
  if p_hora is null or p_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'La hora debe tener formato HH:MM (por ejemplo 16:00).'; end if;
  if coalesce(array_length(cats, 1), 0) = 0 then raise exception 'Cargá al menos una categoría.'; end if;
  if p_precio is null or p_precio not between 0 and 1000000 then raise exception 'Precio inválido.'; end if;
  if p_cupos is null or p_cupos not between 1 and 500 then raise exception 'Los cupos deben estar entre 1 y 500.'; end if;
  if char_length(coalesce(p_descripcion, '')) > 600 then raise exception 'La descripción es demasiado larga (máximo 600 caracteres).'; end if;
  if char_length(coalesce(p_formato, '')) > 400 then raise exception 'El formato es demasiado largo (máximo 400 caracteres).'; end if;
  if p_imagen is not null and p_imagen !~ '^(https://|assets/)[A-Za-z0-9_./%~?=&-]{1,300}$' then
    raise exception 'La imagen debe ser una ruta assets/... o un link https.';
  end if;
  if coalesce(p_estado, '') not in ('abierto', 'cerrado', 'finalizado') then raise exception 'Estado inválido.'; end if;
  p_publicado := coalesce(p_publicado, false);

  if p_id is null then
    if p_fecha < ahora_ar()::date then raise exception 'La fecha del torneo ya pasó.'; end if;
    insert into torneos (titulo, fecha, hora, lugar, categorias, precio, cupos, descripcion, formato, premios, reglamento, imagen, estado, publicado)
    values (p_titulo, p_fecha, p_hora, p_lugar, cats, p_precio, p_cupos, p_descripcion, p_formato, prem, regl, p_imagen, p_estado, p_publicado)
    returning id into tid;
    perform registrar_auditoria('torneos', tid::text, 'crear_torneo', jsonb_build_object('titulo', p_titulo, 'fecha', p_fecha, 'publicado', p_publicado));
  else
    select * into antes from torneos where id = p_id for update;
    if not found then raise exception 'El torneo no existe.'; end if;
    select count(*) into activas from inscripciones where torneo_id = p_id and estado <> 'cancelada';
    if p_cupos < activas then raise exception 'Ya hay % inscriptos: los cupos no pueden ser menos.', activas; end if;
    if exists (select 1 from inscripciones where torneo_id = p_id and estado <> 'cancelada' and not (categoria = any (cats))) then
      raise exception 'No podés sacar una categoría que ya tiene inscriptos.';
    end if;
    update torneos set titulo = p_titulo, fecha = p_fecha, hora = p_hora, lugar = p_lugar, categorias = cats, precio = p_precio, cupos = p_cupos,
           descripcion = p_descripcion, formato = p_formato, premios = prem, reglamento = regl, imagen = p_imagen, estado = p_estado, publicado = p_publicado
     where id = p_id;
    perform registrar_auditoria('torneos', p_id::text, 'editar_torneo', jsonb_build_object(
      'de', jsonb_build_object('titulo', antes.titulo, 'cupos', antes.cupos, 'precio', antes.precio, 'estado', antes.estado, 'publicado', antes.publicado),
      'a', jsonb_build_object('titulo', p_titulo, 'cupos', p_cupos, 'precio', p_precio, 'estado', p_estado, 'publicado', p_publicado)));
  end if;
  return tid;
end $$;

create or replace function admin_estado_inscripcion(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare i inscripciones; t torneos; n int; previo text;
begin
  perform exigir_admin();
  if coalesce(p_estado, '') not in ('pendiente', 'pagada', 'cancelada') then raise exception 'Estado inválido.'; end if;
  select * into i from inscripciones where id = p_id;
  if not found then raise exception 'La inscripción no existe.'; end if;
  select * into t from torneos where id = i.torneo_id for update;       -- se bloquea el torneo primero para no pasarse de cupos
  select * into i from inscripciones where id = p_id for update;
  if i.estado = p_estado then return; end if;
  previo := i.estado;
  if previo = 'cancelada' then
    select count(*) into n from inscripciones where torneo_id = i.torneo_id and estado <> 'cancelada';
    if n >= t.cupos then raise exception 'No quedan cupos para reactivar esta inscripción.'; end if;
  end if;
  update inscripciones set estado = p_estado where id = p_id;
  perform registrar_auditoria('inscripciones', p_id::text, 'estado_inscripcion', jsonb_build_object('torneo', i.torneo_id, 'de', previo, 'a', p_estado));
end $$;

create or replace function admin_guardar_profesor(
  p_id int, p_nombre text, p_especialidad text, p_bio text, p_precio int, p_duracion int, p_foto text,
  p_horarios jsonb, p_etiquetas text[], p_activo boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare pid int := p_id; antes profesores; hor jsonb; k text; v jsonb; et text[]; afectadas int := 0; ahora timestamp := ahora_ar();
begin
  perform exigir_admin();
  p_nombre := sin_html(btrim(coalesce(p_nombre, '')));
  p_especialidad := sin_html(btrim(coalesce(p_especialidad, '')));
  p_bio := sin_html(nullif(btrim(coalesce(p_bio, '')), ''));
  p_foto := nullif(btrim(coalesce(p_foto, '')), '');
  p_activo := coalesce(p_activo, true);
  et := lista_limpia(p_etiquetas, 5, 20, 'las etiquetas');
  if char_length(p_nombre) not between 2 and 80 then raise exception 'El nombre debe tener entre 2 y 80 caracteres.'; end if;
  if char_length(p_especialidad) not between 2 and 80 then raise exception 'La especialidad debe tener entre 2 y 80 caracteres.'; end if;
  if char_length(coalesce(p_bio, '')) > 600 then raise exception 'La bio es demasiado larga (máximo 600 caracteres).'; end if;
  if p_precio is null or p_precio not between 0 and 1000000 then raise exception 'Precio inválido.'; end if;
  if p_duracion is null or p_duracion not between 30 and 180 then raise exception 'La duración debe estar entre 30 y 180 minutos.'; end if;
  if p_foto is not null and p_foto !~ '^(https://|assets/)[A-Za-z0-9_./%~?=&-]{1,300}$' then raise exception 'La foto debe ser una ruta assets/... o un link https.'; end if;
  -- horarios: {"1":[9,10,11], "3":[17,18]}  (día de la semana 0=Dom..6=Sáb -> horas de inicio)
  if p_horarios is null or jsonb_typeof(p_horarios) <> 'object' then raise exception 'Horarios inválidos.'; end if;
  for k, v in select key, value from jsonb_each(p_horarios) loop
    if k !~ '^[0-6]$' or jsonb_typeof(v) <> 'array' then raise exception 'Horarios inválidos.'; end if;
    if exists (select 1 from jsonb_array_elements(v) as t(e)
               where not (case when jsonb_typeof(t.e) = 'number' and (t.e #>> '{}') ~ '^[0-9]{1,2}$' then (t.e #>> '{}')::int <= 23 else false end)) then
      raise exception 'Las horas deben estar entre 0 y 23.';
    end if;
  end loop;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into hor from jsonb_each(p_horarios) where jsonb_array_length(value) > 0;
  if p_activo and hor = '{}'::jsonb then raise exception 'Cargá al menos un día con horarios.'; end if;

  if p_id is null then
    insert into profesores (nombre, especialidad, bio, precio, duracion, foto, horarios, etiquetas, activo)
    values (p_nombre, p_especialidad, p_bio, p_precio, p_duracion, p_foto, hor, et, p_activo) returning id into pid;
    perform registrar_auditoria('profesores', pid::text, 'crear_profesor', jsonb_build_object('nombre', p_nombre, 'precio', p_precio));
  else
    select * into antes from profesores where id = p_id for update;
    if not found then raise exception 'El profesor no existe.'; end if;
    update profesores set nombre = p_nombre, especialidad = p_especialidad, bio = p_bio, precio = p_precio, duracion = p_duracion,
           foto = p_foto, horarios = hor, etiquetas = et, activo = p_activo where id = p_id;
    if antes.activo and not p_activo then  -- no se cancela nada solo: se avisa cuántas clases quedan para que el admin decida
      select count(*) into afectadas from clases
       where profesor_id = p_id and estado <> 'cancelada' and (fecha > ahora::date or (fecha = ahora::date and hora >= extract(hour from ahora)::int));
    end if;
    perform registrar_auditoria('profesores', p_id::text, 'editar_profesor', jsonb_build_object(
      'de', jsonb_build_object('nombre', antes.nombre, 'precio', antes.precio, 'activo', antes.activo),
      'a', jsonb_build_object('nombre', p_nombre, 'precio', p_precio, 'activo', p_activo), 'clases_afectadas', afectadas));
  end if;
  return jsonb_build_object('id', pid, 'afectadas', afectadas);
end $$;

create or replace function admin_estado_clase(p_id uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare c clases;
begin
  perform exigir_admin();
  if coalesce(p_estado, '') not in ('confirmada', 'cancelada') then raise exception 'Estado inválido.'; end if;
  select * into c from clases where id = p_id for update;
  if not found then raise exception 'La clase no existe.'; end if;
  if c.estado = p_estado then return; end if;
  update clases set estado = p_estado where id = p_id;
  perform registrar_auditoria('clases', p_id::text, 'estado_clase', jsonb_build_object('de', c.estado, 'a', p_estado));
exception when unique_violation then
  raise exception 'Ese horario ya fue tomado por otra clase: no se puede reactivar esta.';
end $$;


create or replace function admin_guardar_aviso(p_id int, p_tipo text, p_titulo text, p_texto text, p_enlace text, p_activo boolean) returns int
language plpgsql security definer set search_path = public as $$
declare aid int := p_id;
begin
  perform exigir_admin();
  p_titulo := sin_html(btrim(coalesce(p_titulo, '')));
  p_texto := sin_html(btrim(coalesce(p_texto, '')));
  p_enlace := nullif(btrim(coalesce(p_enlace, '')), '');
  p_activo := coalesce(p_activo, false);
  if coalesce(p_tipo, '') not in ('urgente', 'info', 'torneo') then raise exception 'Tipo de aviso inválido.'; end if;
  if char_length(p_titulo) not between 3 and 80 then raise exception 'El título debe tener entre 3 y 80 caracteres.'; end if;
  if char_length(p_texto) not between 3 and 300 then raise exception 'El texto debe tener entre 3 y 300 caracteres.'; end if;
  -- el enlace termina dentro de un href: solo páginas del sitio (torneos.html?id=1) o links https
  if p_enlace is not null and p_enlace !~ '^(https://[A-Za-z0-9_./%~?=&#-]{1,300}|[A-Za-z0-9_][A-Za-z0-9_./%~?=&#-]{0,300})$' then
    raise exception 'El enlace debe ser una página del sitio (ej: torneos.html) o un link https.';
  end if;
  if p_id is null then
    insert into avisos (tipo, titulo, texto, enlace, activo) values (p_tipo, p_titulo, p_texto, p_enlace, p_activo) returning id into aid;
    perform registrar_auditoria('avisos', aid::text, 'crear_aviso', jsonb_build_object('tipo', p_tipo, 'titulo', p_titulo, 'activo', p_activo));
  else
    update avisos set tipo = p_tipo, titulo = p_titulo, texto = p_texto, enlace = p_enlace, activo = p_activo where id = p_id;
    if not found then raise exception 'El aviso no existe.'; end if;
    perform registrar_auditoria('avisos', p_id::text, 'editar_aviso', jsonb_build_object('tipo', p_tipo, 'titulo', p_titulo, 'activo', p_activo));
  end if;
  return aid;
end $$;

-- Horario de atención (solo el propietario). Devuelve cuántas reservas futuras quedan fuera del nuevo horario.
create or replace function admin_guardar_config(p_hora_ini int, p_hora_fin int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ahora timestamp := ahora_ar(); afectadas int;
begin
  perform exigir_admin();
  if coalesce(rol_admin(), '') <> 'owner' then raise exception 'Solo el propietario puede cambiar el horario de atención.'; end if;
  if p_hora_ini is null or p_hora_fin is null or p_hora_ini not between 0 and 23 or p_hora_fin not between p_hora_ini and 23 then
    raise exception 'Revisá el horario de atención.';
  end if;
  select count(*) into afectadas from reservas r
   where r.estado <> 'cancelada' and (r.hora < p_hora_ini or r.hora > p_hora_fin)
     and (r.fecha > ahora::date or (r.fecha = ahora::date and r.hora >= extract(hour from ahora)::int));
  insert into config_complejo (clave, valor) values ('hora_inicio', to_jsonb(p_hora_ini)), ('hora_fin', to_jsonb(p_hora_fin))
  on conflict (clave) do update set valor = excluded.valor;
  perform registrar_auditoria('config', 'horario', 'guardar_horario', jsonb_build_object('hora_inicio', p_hora_ini, 'hora_fin', p_hora_fin, 'afectadas', afectadas));
  return jsonb_build_object('afectadas', afectadas);
end $$;


revoke execute on function sin_html(text), lista_limpia(text[], int, int, text),
  admin_guardar_torneo(int, text, date, text, text, text[], int, int, text, text, text[], text[], text, text, boolean),
  admin_estado_inscripcion(uuid, text),
  admin_guardar_profesor(int, text, text, text, int, int, text, jsonb, text[], boolean),
  admin_estado_clase(uuid, text),
  admin_guardar_aviso(int, text, text, text, text, boolean),
  admin_guardar_config(int, int) from public, anon, authenticated;
grant execute on function
  admin_guardar_torneo(int, text, date, text, text, text[], int, int, text, text, text[], text[], text, text, boolean),
  admin_estado_inscripcion(uuid, text),
  admin_guardar_profesor(int, text, text, text, int, int, text, jsonb, text[], boolean),
  admin_estado_clase(uuid, text),
  admin_guardar_aviso(int, text, text, text, text, boolean),
  admin_guardar_config(int, int) to authenticated;
