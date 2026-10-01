/* ===== TODO LO EDITABLE VIVE ACÁ ===== */
const CONFIG = {
  nombre: 'PADEL ARENA',
  telefono: '+54 9 343 000-0000',
  whatsapp: '5493430000000',
  email: 'info@padelarena.com',
  direccion: 'Av. Ejemplo 1234, Paraná, Entre Ríos',
  mapsQuery: 'Paraná, Entre Ríos',
  horarios: 'Todos los días de 09:00 a 23:00',
  instagram: 'https://instagram.com/',
  horaInicio: 9,      // primer turno
  horaFin: 22,        // último turno (empieza a las 22:00)
  duracion: '60 min',
  moneda: '$'
};

// Imágenes: poné tus fotos en assets/images y cambiá la ruta. Si el archivo no existe, se ve un degradé.
const IMAGES = {
  hero: 'assets/images/hero.jpg',
  galeria: [
    'assets/images/galeria-1.jpg', 'assets/images/galeria-2.jpg', 'assets/images/galeria-3.jpg',
    'assets/images/galeria-4.jpg', 'assets/images/galeria-5.jpg', 'assets/images/galeria-6.jpg'
  ]
};

const CANCHAS = [
  { id: 1, nombre: 'Cancha 1', tipo: 'Panorámica', precio: 18000, tags: ['Cristal panorámico', 'Iluminación LED'], img: 'assets/images/cancha-1.jpg' },
  { id: 2, nombre: 'Cancha 2', tipo: 'Panorámica', precio: 18000, tags: ['Cristal panorámico', 'Césped premium'], img: 'assets/images/cancha-2.jpg' },
  { id: 3, nombre: 'Cancha 3', tipo: 'Indoor', precio: 20000, tags: ['Techada', 'Climatizada'], img: 'assets/images/cancha-3.jpg' },
  { id: 4, nombre: 'Cancha 4', tipo: 'Indoor', precio: 20000, tags: ['Techada', 'Ideal torneos'], img: 'assets/images/cancha-4.jpg' }
];

const AMENIDADES = [
  ['trophy', 'Canchas profesionales', 'Medidas reglamentarias y superficie de competencia.'],
  ['lightbulb', 'Iluminación', 'LED sin sombras para jugar de noche.'],
  ['shower-head', 'Vestuarios', 'Duchas, lockers y espacio para cambiarte.'],
  ['car', 'Estacionamiento', 'Playa propia, gratis para jugadores.'],
  ['coffee', 'Bar y cafetería', 'Tercer tiempo con algo fresco.'],
  ['wifi', 'WiFi', 'Conexión libre en todo el complejo.'],
  ['backpack', 'Equipamiento', 'Todo lo que te falta, en el mostrador.'],
  ['party-popper', 'Eventos', 'Cumpleaños y encuentros de empresa.']
];

const SERVICIOS = [
  ['swords', 'Alquiler de paletas', 'Probá modelos de gama alta.'],
  ['circle-dot', 'Venta de pelotas', 'Tubos nuevos en el mostrador.'],
  ['user', 'Clases particulares', 'Profesor y cancha, uno a uno.'],
  ['users', 'Clases grupales', 'Por nivel, de 4 a 8 alumnos.'],
  ['medal', 'Torneos', 'Por categoría, todos los meses.'],
  ['calendar-heart', 'Eventos', 'Armamos tu evento a medida.'],
  ['beer', 'Bar', 'Bebidas, snacks y comidas.'],
  ['door-open', 'Vestuarios', 'Abiertos durante todo el horario.']
];

const EVENTOS = [
  { fecha: 'Sáb 18 oct', titulo: 'Torneo Amateur', info: 'Categorías 6ta / 7ma / 8va', destacado: true },
  { fecha: 'Dom 26 oct', titulo: 'Americano Mixto', info: 'Parejas sorteadas, abierto a todos' },
  { fecha: 'Sáb 8 nov', titulo: 'Clínica con profesores', info: 'Técnica de volea y bandeja' }
];

const TESTIMONIOS = [
  { texto: 'Excelente complejo, las canchas están impecables y la atención es excelente.', nombre: 'Martín R.', rol: 'Jugador 6ta' },
  { texto: 'Reservé desde el celular en un minuto. Se juega de noche como de día.', nombre: 'Lucía F.', rol: 'Jugadora 7ma' },
  { texto: 'Las clases grupales me hicieron mejorar muchísimo. Gran ambiente.', nombre: 'Tomás B.', rol: 'Jugador 8va' }
];