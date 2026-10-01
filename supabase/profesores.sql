-- Pegar completo en Supabase → SQL Editor → Run (después de schema.sql)

create table profesores (
  id serial primary key, nombre text not null, especialidad text not null, bio text,
  precio int not null, duracion int not null default 60, foto text,
  horarios jsonb not null   -- {"1":[9,10,11], "3":[17,18]}  día de la semana (0=Dom..6=Sáb) -> horas de inicio
);

create table clases (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  profesor_id int not null references profesores(id),
  fecha date not null, hora int not null,
  nombre text not null, telefono text not null, email text not null,
  email_enviado boolean not null default false,   -- evita mandar dos veces el mismo mail
  created_at timestamptz default now(),
  unique (profesor_id, fecha, hora)
);

alter table profesores enable row level security;
alter table clases enable row level security;
create policy "profesores públicos" on profesores for select using (true);

create function clases_ocupadas(p_prof int, p_fecha date) returns table(hora int)
language sql security definer set search_path = public as
$$ select hora from clases where profesor_id = p_prof and fecha = p_fecha $$;

create function reservar_clase(p_prof int, p_fecha date, p_hora int, p_nombre text, p_telefono text, p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare cod text := upper(substr(md5(random()::text), 1, 6)); p profesores;
begin
  if p_fecha < current_date then raise exception 'No se puede reservar en una fecha pasada.'; end if;
  select * into p from profesores where id = p_prof;
  if not found then raise exception 'El profesor no existe.'; end if;
  -- el profe tiene que dar clase en ese día y horario (lo valida la base, no el navegador)
  if not coalesce((p.horarios -> (extract(dow from p_fecha)::int)::text) @> to_jsonb(p_hora), false) then
    raise exception 'El profe no da clases en ese horario.';
  end if;
  insert into clases(codigo, profesor_id, fecha, hora, nombre, telefono, email)
  values (cod, p_prof, p_fecha, p_hora, p_nombre, p_telefono, p_email);
  return cod;
exception when unique_violation then
  raise exception 'Ese horario ya fue reservado. Elegí otro.';
end $$;

insert into profesores (nombre, especialidad, bio, precio, duracion, horarios) values
('Nicolás Bravo','Iniciación y técnica base','Para quienes arrancan o quieren ordenar su juego: golpes básicos, posición en la cancha y una buena base para disfrutar los partidos.',16000,60,
 '{"1":[9,10,11,17,18,19],"3":[9,10,11,17,18,19],"5":[9,10,11,16,17],"6":[10,11,12]}'),
('Camila Ortega','Táctica y competencia','Entrenamiento para jugadores de 6ta y 7ma que compiten: bandeja, víbora, estrategia de pareja y manejo de los puntos importantes.',18000,60,
 '{"2":[16,17,18,19,20],"4":[16,17,18,19,20],"6":[15,16,17],"0":[10,11]}');