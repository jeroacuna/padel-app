
insert into canchas (id, nombre, tipo, precio) values
  (1,'Cancha 1','Panorámica',18000),(2,'Cancha 2','Panorámica',18000),(3,'Cancha 3','Indoor',20000),(4,'Cancha 4','Indoor',20000)
on conflict (id) do nothing;

insert into avisos (tipo, titulo, texto, enlace, activo)
select * from (values
  ('urgente','Hoy cerramos por lluvia','Las canchas descubiertas no están disponibles. Las indoor siguen abiertas.',null,false),
  ('info','Martes 13: ¡nuevo torneo!','Estén atentos: el martes 13 anunciamos un torneo nuevo con premios y cupos limitados.','torneos.html',true),
  ('torneo','Abrió la inscripción al Torneo Amateur','Categorías 6ta, 7ma y 8va. Quedan pocos cupos.','torneos.html?id=1',true),
  ('info','Clases con profes nuevos','Nicolás y Camila ya tienen horarios disponibles para esta semana.','profesores.html',true)
) v(tipo,titulo,texto,enlace,activo) where not exists (select 1 from avisos);

update torneos set imagen = 'assets/images/galeria-1.jpg' where titulo = 'Torneo Amateur' and imagen is null;
update torneos set imagen = 'assets/images/galeria-3.jpg' where titulo = 'Americano Mixto' and imagen is null;
update torneos set imagen = 'assets/images/galeria-6.jpg' where titulo = 'Clínica con profesores' and imagen is null;
update profesores set etiquetas = '{Principiantes,Técnica,Niños}' where nombre = 'Nicolás Bravo' and etiquetas is null;
update profesores set etiquetas = '{Competencia,Táctica,"6ta y 7ma"}' where nombre = 'Camila Ortega' and etiquetas is null;