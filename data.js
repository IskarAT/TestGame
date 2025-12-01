// data.js
export const TICKS_PER_SECOND = 20;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

export const RES = {
  POP: 'population',
  STONE: 'stone',
  WOOD: 'wood',
  FOOD: 'food'
};

export const BUILDINGS = {
  house: {
    id: 'house',
    name: 'House',
    desc: 'Increases maximum population.',
    baseCost: { wood: 10, stone: 5, food: 0 },
    costPercent: 0.15,
    costFlat: 6,
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
    costFlat: 10,
    storageIncrease: { wood: 50, stone: 50, food: 50 },
    flatYield: null,
    jobPercentBoost: null,
    unlocksJob: null
  },
  forester: {
    id: 'forester',
    name: 'Forester',
    desc: 'Improves wood gathering (adds % boost to lumberjacks).',
    baseCost: { wood: 5, stone: 12},
    costPercent: 0.15,
    costFlat: 8,
    flatYield: null,
    jobPercentBoost: { wood: 0.10 },
    unlocksJob: 'lumberjack'
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    desc: 'Improves stone gathering (adds % boost to stone masons).',
    baseCost: { wood: 15, stone: 10},
    costPercent: 0.15,
    costFlat: 6,
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
    costFlat: 10,
    flatYield: { food: 0.5 },
    jobPercentBoost: { food: 0.08 },
    unlocksJob: 'farmer'
  }
};

export const JOBS = {
  unemployed: { id: 'unemployed', name: 'Unemployed', desc: 'People without a job.' },
  farmer: { id: 'farmer', name: 'Farmer', desc: 'Produces food. Always unaffected by food shortage.' },
  lumberjack: { id: 'lumberjack', name: 'Lumberjack', desc: 'Gathers wood.' },
  stonemason: { id: 'stonemason', name: 'Stone Mason', desc: 'Gathers stone.' }
};

// Upgrades definitions
export const UPGRADES = {
  farmerBoost: {
    id: 'farmerBoost',
    name: 'Improved Farming',
    desc: 'Each purchase increases farmers food gain by 25%.',
    baseCost: { food: 50, wood: 30 },
    multiplier: 3, // cost multiplies by 5 each purchase
    maxPurchases: 3,
    effectPer: { farmerPercent: 0.25 } // additive
  },
  lumberStoneBoost: {
    id: 'lumberStoneBoost',
    name: 'Tooling and Training',
    desc: 'Each purchase increases lumberjack wood gain by 30% and stonemason stone gain by 20%.',
    baseCost: { wood: 50, stone: 30 },
    multiplier: 2.5,
    maxPurchases: 3,
    effectPer: { woodPercent: 0.30, stonePercent: 0.20 }
  },
  storageBoost: {
    id: 'storageBoost',
    name: 'Improved Storage Design',
    desc: 'Each purchase increases storage room capacity by +5 per storage room.',
    baseCost: { wood: 40, stone: 40 },
    multiplier: 4,
    maxPurchases: 3,
    effectPer: { storagePerRoomFlat: 5 }
  },
  housingUpgrade: {
    id: 'housingUpgrade',
    name: 'Advanced Housing',
    desc: 'Increase population per house by +1 and increase food upkeep per population by 35%. Single purchase.',
    baseCost: { wood: 1000, stone: 1200, food: 1800 },
    multiplier: 5,
    maxPurchases: 1,
    effectPer: { housePopPer: 1, foodUpkeepPercent: 0.35 }
  }
};

export function createInitialState() {
  const state = {
    resources: {
      [RES.POP]: 0,
      [RES.STONE]: 100,
      [RES.WOOD]: 100,
      [RES.FOOD]: 100
    },
    resourceMax: {
      [RES.POP]: 0,
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
    population: 0,
    popAccumulator: 0.0,
    events: [],
    ticks: 0,
    upgradesPurchased: {
      farmerBoost: 0,
      lumberStoneBoost: 0,
      storageBoost: 0,
      housingUpgrade: 0
    }
  };

  return state;
}

