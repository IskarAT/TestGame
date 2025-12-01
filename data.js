// data.js
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

// Resource keys
export const RES = {
  POP: 'population',
  STONE: 'stone',
  WOOD: 'wood',
  FOOD: 'food'
};

// Building definitions
export const BUILDINGS = {
  house: {
    id: 'house',
    name: 'House',
    desc: 'Increases maximum population.',
    baseCost: { wood: 10, stone: 5, food: 0 },
    costPercent: 0.15,
    costFlat: 2,
    // house-specific
    popCapacityPer: 5,
    flatYield: null,
    jobPercentBoost: null,
    unlocksJob: null
  },
  storage: {
    id: 'storage',
    name: 'Storage room',
    desc: 'Increases storage capacity for all resources.',
    baseCost: { wood: 20, stone: 10, food: 0 },
    costPercent: 0.12,
    costFlat: 5,
    storageIncrease: { wood: 50, stone: 50, food: 50 },
    flatYield: null,
    jobPercentBoost: null,
    unlocksJob: null
  },
  forester: {
    id: 'forester',
    name: 'Forester',
    desc: 'Improves wood gathering (adds % boost to lumberjacks).',
    baseCost: { wood: 15, stone: 8, food: 0 },
    costPercent: 0.15,
    costFlat: 3,
    flatYield: null,
    jobPercentBoost: { wood: 0.10 }, // +10% per forester
    unlocksJob: 'lumberjack'
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    desc: 'Improves stone gathering (adds % boost to stone masons).',
    baseCost: { wood: 12, stone: 12, food: 0 },
    costPercent: 0.15,
    costFlat: 3,
    flatYield: null,
    jobPercentBoost: { stone: 0.10 },
    unlocksJob: 'stonemason'
  },
  fields: {
    id: 'fields',
    name: 'Fields',
    desc: 'Produces food and improves farmers (flat + %).',
    baseCost: { wood: 8, stone: 4, food: 0 },
    costPercent: 0.12,
    costFlat: 2,
    flatYield: { food: 0.5 }, // per field per second (converted per tick)
    jobPercentBoost: { food: 0.05 }, // +5% per field
    unlocksJob: 'farmer'
  }
};

// Job definitions
export const JOBS = {
  unemployed: { id: 'unemployed', name: 'Unemployed', desc: 'People without a job.' },
  farmer: { id: 'farmer', name: 'Farmer', desc: 'Produces food. Always unaffected by food shortage.' },
  lumberjack: { id: 'lumberjack', name: 'Lumberjack', desc: 'Gathers wood.' },
  stonemason: { id: 'stonemason', name: 'Stone Mason', desc: 'Gathers stone.' }
};

// Initial game state
export function createInitialState() {
  const state = {
    resources: {
      [RES.POP]: 0,
      [RES.STONE]: 100,
      [RES.WOOD]: 100,
      [RES.FOOD]: 100
    },
    resourceMax: {
      [RES.POP]: 0, // computed from houses
      [RES.STONE]: 200,
      [RES.WOOD]: 200,
      [RES.FOOD]: 200
    },
    buildings: {
      house: 1,
      storage: 0,
      forester: 0,
      quarry: 0,
      fields: 0
    },
    jobsAssigned: {
      unemployed: 0,
      farmer: 0,
      lumberjack: 0,
      stonemason: 0
    },
    unlockedJobs: {
      farmer: false,
      lumberjack: false,
      stonemason: false
    },
    // population tracked as integer, but growth uses accumulator
    population: 0,
    popAccumulator: 0.0,
    // event log
    events: [],
    // misc
    ticks: 0
  };

  // Start with 1 house but 0 population as requested
  // Ensure storage is enough to buy 1 of each building (we gave starting resources above)
  return state;
}
