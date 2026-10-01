/* ===== TODO LO EDITABLE VIVE ACÁ ===== */
const CONFIG = {
  nombre: 'PADEL ARENA',
  telefono: '+54 9 343 695-8831',
  whatsapp: '5493436958831',
  email: 'info@padelarena.com',
  direccion: 'Smash Padel, Paraná, Entre Ríos',
  mapsQuery: 'Smash Padel, Paraná, Entre Ríos',
  horarios: 'Todos los días de 09:00 a 23:00',
  instagram: 'https://instagram.com/jerooo._',
  horaInicio: 9,      // primer turno
  horaFin: 22,        // último turno (empieza a las 22:00)
  duracion: '60 min',
  moneda: '$',
  pagoAlias: 'padelarena.pago', // alias para transferencias (ficticio)
  pagoTitular: 'Padel Arena (demo)'
};

// Imágenes: poné tus fotos en assets/images y cambiá la ruta. Si el archivo no existe, se ve un degradé.
const IMAGES = {
  hero: 'assets/images/hero.jpg',
  galeria: [
    'assets/images/galeria-1.jpg', 'assets/images/galeria-2.jpg', 'assets/images/galeria-3.jpg',
    'assets/images/galeria-4.jpg', 'assets/images/hero.jpg', 'assets/images/galeria-6.jpg'
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

const TORNEOS = [
  { id: 1, titulo: 'Torneo Amateur', fecha: '2026-10-24', hora: '09:00', categorias: ['6ta', '7ma', '8va'], precio: 24000, cupos: 16, inscriptos: 9,
    lugar: 'Padel Arena · Canchas 1 a 4', formato: 'Fase de grupos y eliminación directa. Cada pareja juega mínimo 3 partidos.',
    descripcion: 'El torneo amateur del año. Una jornada completa de pádel con tres categorías, árbitros y tercer tiempo en el bar.',
    premios: ['Trofeo + kit de paletas', 'Trofeo + vouchers de clases', 'Medallas + 2 tubos de pelotas'],
    reglamento: ['Parejas fijas, sin cambios después de inscribirse', 'Partidos al mejor de 3 sets, con punto de oro', 'Tolerancia de 10 minutos, después W.O.', 'Inscripción confirmada al acreditar el pago'] },
  { id: 2, titulo: 'Americano Mixto', fecha: '2026-11-01', hora: '16:00', categorias: ['Mixto libre'], precio: 12000, cupos: 24, inscriptos: 11,
    lugar: 'Padel Arena · Canchas 1 y 2', formato: 'Parejas rotativas: jugás con distintos compañeros y sumás puntos individuales.',
    descripcion: 'Ideal para conocer gente nueva y jugar sin presión. Abierto a todos los niveles.',
    premios: ['Premio sorpresa del bar', 'Voucher de alquiler de paletas', 'Tubo de pelotas'],
    reglamento: ['Sorteo de parejas en cada ronda', 'Rondas de 20 minutos', 'Gana quien más puntos acumule'] },
  { id: 3, titulo: 'Clínica con profesores', fecha: '2026-11-14', hora: '10:00', categorias: ['Todos los niveles'], precio: 15000, cupos: 12, inscriptos: 4,
    lugar: 'Padel Arena · Cancha 3 (indoor)', formato: 'Clase intensiva de 3 horas, grupos reducidos y video análisis.',
    descripcion: 'Trabajá volea, bandeja y salida de pared con profesores del complejo.',
    premios: ['Certificado de participación', 'Descuento en clases grupales', 'Sorteo de una paleta'],
    reglamento: ['Traé tu paleta o alquilá en el mostrador', 'Cupos limitados por orden de inscripción'] }
];

const TESTIMONIOS = [
  { texto: 'Excelente complejo, las canchas están impecables y la atención es excelente.', nombre: 'Martín R.', rol: 'Jugador 6ta' },
  { texto: 'Reservé desde el celular en un minuto. Se juega de noche como de día.', nombre: 'Lucía F.', rol: 'Jugadora 7ma' },
  { texto: 'Las clases grupales me hicieron mejorar muchísimo. Gran ambiente.', nombre: 'Tomás B.', rol: 'Jugador 8va' }
];

// Profesores (modo local). Con Supabase se leen de la tabla "profesores".
// horarios: día de la semana (0=Dom ... 6=Sáb) -> horas de inicio. foto: ruta opcional, ej. 'assets/images/profe-1.jpg'
const PROFESORES = [
  { id: 1, nombre: 'Nicolás Bravo', especialidad: 'Iniciación y técnica base', precio: 16000, duracion: 60, foto: '',
    bio: 'Para quienes arrancan o quieren ordenar su juego: golpes básicos, posición en la cancha y una buena base para disfrutar los partidos.',
    horarios: { 1: [9, 10, 11, 17, 18, 19], 3: [9, 10, 11, 17, 18, 19], 5: [9, 10, 11, 16, 17], 6: [10, 11, 12] } },
  { id: 2, nombre: 'Camila Ortega', especialidad: 'Táctica y competencia', precio: 18000, duracion: 60, foto: '',
    bio: 'Entrenamiento para jugadores de 6ta y 7ma que compiten: bandeja, víbora, estrategia de pareja y manejo de los puntos importantes.',
    horarios: { 2: [16, 17, 18, 19, 20], 4: [16, 17, 18, 19, 20], 6: [15, 16, 17], 0: [10, 11] } }
];