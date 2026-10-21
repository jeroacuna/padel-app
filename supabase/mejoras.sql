
-- 1) Avisos y novedades
create table avisos (
  id serial primary key,
  tipo text not null check (tipo in ('urgente', 'info', 'torneo')),
  titulo text not null, texto text not null, enlace text,
  activo boolean not null default true,   -- apagalo/prendelo desde Table Editor
  fecha date not null default current_date
);
alter table avisos enable row level security;
create policy "avisos activos" on avisos for select using (activo);
grant select on avisos to anon, authenticated;

insert into avisos (tipo, titulo, texto, enlace, activo) values
('urgente', 'Hoy cerramos por lluvia', 'Las canchas descubiertas no están disponibles. Las indoor siguen abiertas.', null, false),
('info', 'Martes 13: ¡nuevo torneo!', 'Estén atentos: el martes 13 anunciamos un torneo nuevo con premios y cupos limitados.', 'torneos.html', true),
('torneo', 'Abrió la inscripción al Torneo Amateur', 'Categorías 6ta, 7ma y 8va. Quedan pocos cupos.', 'torneos.html?id=1', true),
('info', 'Clases con profes nuevos', 'Nicolás y Camila ya tienen horarios disponibles para esta semana.', 'profesores.html', true);

-- 2) Portadas de torneos y etiquetas de profesores
alter table torneos add column imagen text;
alter table profesores add column etiquetas text[];

update torneos set imagen = 'assets/images/galeria-1.jpg' where titulo = 'Torneo Amateur';
update torneos set imagen = 'assets/images/galeria-3.jpg' where titulo = 'Americano Mixto';
update torneos set imagen = 'assets/images/galeria-6.jpg' where titulo = 'Clínica con profesores';
update profesores set etiquetas = '{Principiantes,Técnica,Niños}' where nombre = 'Nicolás Bravo';
update profesores set etiquetas = '{Competencia,Táctica,"6ta y 7ma"}' where nombre = 'Camila Ortega';

-- 3) La vista tiene que recrearse para incluir la columna nueva
drop view torneos_info;
create view torneos_info as
  select t.*, (select count(*)::int from inscripciones i where i.torneo_id = t.id and i.estado <> 'cancelada') as inscriptos
  from torneos t;
grant select on torneos_info to anon, authenticated;