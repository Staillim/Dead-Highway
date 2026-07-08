export const VEHICLE_UPGRADES = {
  turret: { name: 'Torreta', level: 4, rarity: 3, maxLevel: 10 },
  armor: { name: 'Blindaje', level: 3, rarity: 2, maxLevel: 10 },
  engine: { name: 'Motor', level: 4, rarity: 4, maxLevel: 10 },
  nitro: { name: 'Nitro', level: 3, rarity: 3, maxLevel: 10 },
  shield: { name: 'Escudo', level: 2, rarity: 2, maxLevel: 10 },
  tires: { name: 'Llantas', level: 3, rarity: 2, maxLevel: 10 }
};

export const VEHICLE_STATS = {
  health: { name: 'Salud', value: 85, icon: '❤️' },
  speed: { name: 'Velocidad', value: 70, icon: '⚡' },
  handling: { name: 'Manejo', value: 65, icon: '🎮' },
  damage: { name: 'Daño', value: 60, icon: '⚔️' },
  armor: { name: 'Blindaje', value: 80, icon: '🛡️' }
};

export const CAR_MODEL_FILES = {
  rugged_car_01: 'rugged_car_01',
  predator: 'sports+car+3d+model',
  thunder: 'off-road+pickup+3d+model',
  raptor: 'monster+truck+3d+model',
  tanker: 'swat+armored+vehicle+3d+model'
};

// Catálogo de coches: solo el Destructor viene desbloqueado; el resto se COMPRA
// (monedas o gemas). `power` es un multiplicador de stats que aplica la partida
// (hp/daño/velocidad). El Tanker SWAT es PREMIUM (gemas) con las mejores stats.
export const GARAGE_CARS = [
  { id: 'rugged_car_01', name: 'Destructor', color: '#e04a3a', price: null, power: 1.0, rarity: 1 },
  { id: 'predator', name: 'Predator', color: '#9b4ddb', price: { coins: 8000 }, power: 1.08, rarity: 2 },
  { id: 'thunder', name: 'Thunder', color: '#f2c21f', price: { coins: 16000 }, power: 1.15, rarity: 3 },
  { id: 'raptor', name: 'Raptor', color: '#3f8ef2', price: { coins: 30000 }, power: 1.24, rarity: 4 },
  { id: 'tanker', name: 'Tanker SWAT', color: '#6f9c4a', price: { gems: 350 }, power: 1.42, rarity: 5, premium: true }
];

// Coche(s) que el jugador tiene de arranque
export const DEFAULT_OWNED_CARS = ['rugged_car_01'];

// Devuelve la config de un coche por id
export const carById = (id) => GARAGE_CARS.find((c) => c.id === id) || GARAGE_CARS[0];
