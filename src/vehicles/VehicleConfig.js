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

export const GARAGE_CARS = [
  { id: 'rugged_car_01', name: 'Destructor', unlocked: true, equipped: true, pieces: null, maxPieces: null },
  { id: 'predator', name: 'Predator', unlocked: true, pieces: null, maxPieces: null },
  { id: 'thunder', name: 'Thunder', unlocked: true, pieces: null, maxPieces: null },
  { id: 'raptor', name: 'Raptor', unlocked: true, pieces: null, maxPieces: null },
  { id: 'tanker', name: 'Tanker', unlocked: true, pieces: null, maxPieces: null }
];
