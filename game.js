// game.js
import { TICKS_PER_SECOND, TICK_MS, RES, BUILDINGS, JOBS, createInitialState, UPGRADES } from './data.js';

export class Game {
  constructor() {
    this.state = createInitialState();
    this.tickInterval = null;
    this.listeners = [];
    this.foodPerPopPerSecondBase = 0.1; // base
    this.populationGrowthRatePerSecond = 0.2;
    this.populationDeclineRatePerSecond = 0.5;
    this.jobBaseIncomePerSecond = {
      farmer: 0.5,
      lumberjack: 0.3,
      stonemason: 0.25
    };
  }

  onUpdate(fn) { this.listeners.push(fn); }
  emitUpdate() { this.listeners.forEach(fn => fn(this.state)); }

  start() {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (!this.tickInterval) return;
    clearInterval(this.tickInterval);
    this.tickInterval = null;
  }

  // cost calculation
  getBuildCost(buildingId) {
    const b = BUILDINGS[buildingId];
    const count = this.state.buildings[buildingId] || 0;
    const cost = {};
    for (const r of ['wood','stone','food']) {
      const base = b.baseCost[r] || 0;
      const val = Math.floor(base * Math.pow(1 + b.costPercent, count) + (b.costFlat || 0) * count);
      cost[r] = val;
    }
    return cost;
  }

  canAfford(cost) {
    for (const k of Object.keys(cost)) {
      if ((this.state.resources[k] || 0) < cost[k]) return false;
    }
    return true;
  }

  costExceedsStorage(cost) {
    for (const k of Object.keys(cost)) {
      if (k === RES.POP) continue;
      if ((cost[k] || 0) > (this.state.resourceMax[k] || 0)) return true;
    }
    return false;
  }

  build(buildingId) {
    const cost = this.getBuildCost(buildingId);
    if (!this.canAfford(cost)) return false;
    for (const r of Object.keys(cost)) {
      this.state.resources[r] = Math.max(0, (this.state.resources[r] || 0) - cost[r]);
    }
    this.state.buildings[buildingId] = (this.state.buildings[buildingId] || 0) + 1;
    if (buildingId === 'storage') {
      const inc = BUILDINGS.storage.storageIncrease;
      for (const r of Object.keys(inc)) {
        this.state.resourceMax[r] = (this.state.resourceMax[r] || 0) + inc[r];
      }
    }
    const unlock = BUILDINGS[buildingId].unlocksJob;
    if (unlock) {
      this.state.unlockedJobs[unlock] = true;
    }
    this.logEvent(`Built ${BUILDINGS[buildingId].name} (total: ${this.state.buildings[buildingId]})`);
    this.emitUpdate();
    return true;
  }

  // job assignment
  assignJob(jobId, amount=1) {
    if (jobId !== 'unemployed' && !this.state.unlockedJobs[jobId]) return false;
    const assignedNonUnemployed = (this.state.jobsAssigned.farmer || 0)
      + (this.state.jobsAssigned.lumberjack || 0)
      + (this.state.jobsAssigned.stonemason || 0);
    if (jobId === 'unemployed') {
      const totalAssigned = assignedNonUnemployed + (this.state.jobsAssigned.unemployed || 0);
      if (totalAssigned + amount > this.state.population) return false;
      this.state.jobsAssigned.unemployed = (this.state.jobsAssigned.unemployed || 0) + amount;
      this.emitUpdate();
      return true;
    } else {
      if (assignedNonUnemployed + amount > this.state.population) return false;
      this.state.jobsAssigned[jobId] = (this.state.jobsAssigned[jobId] || 0) + amount;
      const newAssignedNonUnemployed = (this.state.jobsAssigned.farmer || 0)
        + (this.state.jobsAssigned.lumberjack || 0)
        + (this.state.jobsAssigned.stonemason || 0);
      this.state.jobsAssigned.unemployed = Math.max(0, this.state.population - newAssignedNonUnemployed);
      this.emitUpdate();
      return true;
    }
  }

  unassignJob(jobId, amount=1) {
    this.state.jobsAssigned[jobId] = Math.max(0, (this.state.jobsAssigned[jobId] || 0) - amount);
    const assignedNonUnemployed = (this.state.jobsAssigned.farmer || 0)
      + (this.state.jobsAssigned.lumberjack || 0)
      + (this.state.jobsAssigned.stonemason || 0);
    this.state.jobsAssigned.unemployed = Math.max(0, this.state.population - assignedNonUnemployed);
    this.emitUpdate();
  }

  manualGather(resourceKey, amount=1) {
    this.state.resources[resourceKey] = Math.min(this.state.resourceMax[resourceKey] || Infinity, (this.state.resources[resourceKey] || 0) + amount);
    this.emitUpdate();
  }

  // Upgrades
  getUpgradeCost(upgradeId) {
    const u = UPGRADES[upgradeId];
    const bought = this.state.upgradesPurchased[upgradeId] || 0;
    const cost = {};
    for (const r of Object.keys(u.baseCost)) {
      cost[r] = Math.floor(u.baseCost[r] * Math.pow(u.multiplier, bought));
    }
    return cost;
  }

  canAffordUpgrade(upgradeId) {
    const cost = this.getUpgradeCost(upgradeId);
    return this.canAfford(cost);
  }

  upgradeCostExceedsStorage(upgradeId) {
    const cost = this.getUpgradeCost(upgradeId);
    return this.costExceedsStorage(cost);
  }

  buyUpgrade(upgradeId) {
    const u = UPGRADES[upgradeId];
    const bought = this.state.upgradesPurchased[upgradeId] || 0;
    if (bought >= u.maxPurchases) return false;
    const cost = this.getUpgradeCost(upgradeId);
    if (!this.canAfford(cost)) return false;
    for (const r of Object.keys(cost)) {
      this.state.resources[r] = Math.max(0, (this.state.resources[r] || 0) - cost[r]);
    }
    this.state.upgradesPurchased[upgradeId] = bought + 1;
    this.logEvent(`Bought upgrade: ${u.name} (level ${this.state.upgradesPurchased[upgradeId]})`);
    this.emitUpdate();
    return true;
  }

  // compute job boosts including building boosts and upgrades
  computeJobBoosts() {
    const boosts = { food: 0, wood: 0, stone: 0 };
    for (const bId of Object.keys(this.state.buildings)) {
      const count = this.state.buildings[bId] || 0;
      if (!count) continue;
      const b = BUILDINGS[bId];
      if (b.jobPercentBoost) {
        for (const k of Object.keys(b.jobPercentBoost)) {
          boosts[k] = (boosts[k] || 0) + b.jobPercentBoost[k] * count;
        }
      }
    }
    // upgrades
    const farmerBoostCount = this.state.upgradesPurchased.farmerBoost || 0;
    boosts.food += (UPGRADES.farmerBoost.effectPer.farmerPercent || 0) * farmerBoostCount;

    const lsCount = this.state.upgradesPurchased.lumberStoneBoost || 0;
    boosts.wood += (UPGRADES.lumberStoneBoost.effectPer.woodPercent || 0) * lsCount;
    boosts.stone += (UPGRADES.lumberStoneBoost.effectPer.stonePercent || 0) * lsCount;

    return boosts;
  }

  computeBuildingFlatYieldsPerSecond() {
    const flat = { food: 0, wood: 0, stone: 0 };
    for (const bId of Object.keys(this.state.buildings)) {
      const count = this.state.buildings[bId] || 0;
      if (!count) continue;
      const b = BUILDINGS[bId];
      if (b.flatYield) {
        for (const k of Object.keys(b.flatYield)) {
          flat[k] = (flat[k] || 0) + b.flatYield[k] * count;
        }
      }
    }
    return flat;
  }

  // compute storage extra per storage room from upgrades
  storageExtraPerRoom() {
    const count = this.state.upgradesPurchased.storageBoost || 0;
    return (UPGRADES.storageBoost.effectPer.storagePerRoomFlat || 0) * count;
  }

  // compute house pop capacity per house (base 5, housing upgrade adds +1)
  housePopPer() {
    const base = BUILDINGS.house.popCapacityPer || 5;
    const housingBought = this.state.upgradesPurchased.housingUpgrade || 0;
    if (housingBought > 0) return base + (UPGRADES.housingUpgrade.effectPer.housePopPer || 0);
    return base;
  }

  // compute food upkeep per pop including housing upgrade percent
  foodPerPopPerSecond() {
    const base = this.foodPerPopPerSecondBase;
    const housingBought = this.state.upgradesPurchased.housingUpgrade || 0;
    if (housingBought > 0) {
      return base * (1 + (UPGRADES.housingUpgrade.effectPer.foodUpkeepPercent || 0));
    }
    return base;
  }

  // Save / Load
  serializeState() {
    return JSON.stringify(this.state);
  }

  saveToLocalStorage(key = 'incremental_save_v1') {
    try {
      const data = this.serializeState();
      localStorage.setItem(key, data);
      this.logEvent('Game saved.');
      this.emitUpdate();
      return true;
    } catch (e) {
      console.error('Save failed', e);
      return false;
    }
  }

  loadFromLocalStorage(key = 'incremental_save_v1') {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      // basic validation: must have resources and buildings
      if (!parsed.resources || !parsed.buildings) return false;
      this.state = parsed;
      this.logEvent('Save loaded.');
      this.emitUpdate();
      return true;
    } catch (e) {
      console.error('Load failed', e);
      return false;
    }
  }

  // main tick
  tick() {
    this.state.ticks++;
    const s = this.state;
    const boosts = this.computeJobBoosts();
    const flatYieldsPerSecond = this.computeBuildingFlatYieldsPerSecond();

    const houses = s.buildings.house || 0;
    const popCap = houses * this.housePopPer();
    s.resourceMax[RES.POP] = popCap;

    // compute resourceMax for other resources including storageBoost per room
    const baseMax = { wood: 200, stone: 200, food: 200 };
    for (const r of ['wood','stone','food']) {
      const base = s.resourceMax[r] || baseMax[r];
      // storage rooms add base BUILDINGS.storage.storageIncrease per room already applied on build
      // apply additional per-room upgrade
      const storageRooms = s.buildings.storage || 0;
      const extraPerRoom = this.storageExtraPerRoom();
      s.resourceMax[r] = Math.max(base, (s.resourceMax[r] || base) + storageRooms * extraPerRoom);
    }

    const foodUpkeepPerSecond = s.population * this.foodPerPopPerSecond();
    const foodUpkeepPerTick = foodUpkeepPerSecond / TICKS_PER_SECOND;

    const jobIncomePerTick = { food: 0, wood: 0, stone: 0 };

    const farmers = s.jobsAssigned.farmer || 0;
    jobIncomePerTick.food += (farmers * this.jobBaseIncomePerSecond.farmer * (1 + (boosts.food || 0))) / TICKS_PER_SECOND;

    const lumber = s.jobsAssigned.lumberjack || 0;
    jobIncomePerTick.wood += (lumber * this.jobBaseIncomePerSecond.lumberjack * (1 + (boosts.wood || 0))) / TICKS_PER_SECOND;

    const masons = s.jobsAssigned.stonemason || 0;
    jobIncomePerTick.stone += (masons * this.jobBaseIncomePerSecond.stonemason * (1 + (boosts.stone || 0))) / TICKS_PER_SECOND;

    for (const k of Object.keys(flatYieldsPerSecond)) {
      jobIncomePerTick[k] = (jobIncomePerTick[k] || 0) + (flatYieldsPerSecond[k] / TICKS_PER_SECOND);
    }

    const netFoodPerSecond = (jobIncomePerTick.food * TICKS_PER_SECOND) - foodUpkeepPerSecond;

    if (s.resources.food <= 0) {
      jobIncomePerTick.wood *= 0.7;
      jobIncomePerTick.stone *= 0.7;
    }

    const foodDelta = jobIncomePerTick.food - foodUpkeepPerTick;
    s.resources.food = Math.max(0, (s.resources.food || 0) + foodDelta);
    s.resources.wood = Math.max(0, (s.resources.wood || 0) + jobIncomePerTick.wood);
    s.resources.stone = Math.max(0, (s.resources.stone || 0) + jobIncomePerTick.stone);

    for (const r of [RES.WOOD, RES.STONE, RES.FOOD]) {
      if (s.resourceMax[r] !== undefined) {
        s.resources[r] = Math.min(s.resources[r], s.resourceMax[r]);
      }
    }

    if (netFoodPerSecond >= 0) {
      const missing = Math.max(0, popCap - s.population);
      const growthPerSecond = missing * this.populationGrowthRatePerSecond;
      const growthPerTick = growthPerSecond / TICKS_PER_SECOND;
      s.popAccumulator += growthPerTick;
    } else {
      if (netFoodPerSecond < -2 * foodUpkeepPerSecond) {
        const declinePerSecond = s.population * this.populationDeclineRatePerSecond;
        const declinePerTick = declinePerSecond / TICKS_PER_SECOND;
        s.popAccumulator -= declinePerTick;
      }
    }

    if (s.popAccumulator >= 1) {
      const whole = Math.floor(s.popAccumulator);
      const newPop = Math.min(popCap, s.population + whole);
      const applied = newPop - s.population;
      if (applied > 0) {
        s.population = newPop;
        s.popAccumulator -= applied;
        this.logEvent(`Population increased by ${applied} (now ${s.population})`);
      } else {
        s.popAccumulator = 0;
      }
    } else if (s.popAccumulator <= -1) {
      const whole = Math.floor(Math.abs(s.popAccumulator));
      const newPop = Math.max(0, s.population - whole);
      const applied = s.population - newPop;
      if (applied > 0) {
        s.population = newPop;
        s.popAccumulator += applied;
        this.logEvent(`Population decreased by ${applied} (now ${s.population})`);
        this.trimJobsAfterPopulationLoss();
      } else {
        s.popAccumulator = 0;
      }
    }

    s.population = Math.floor(s.population);

    const assignedNonUnemployed = (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    s.jobsAssigned.unemployed = Math.max(0, s.population - assignedNonUnemployed);

    for (const k of Object.keys(s.resources)) {
      if (s.resources[k] < 0) s.resources[k] = 0;
    }

    this.emitUpdate();
  }

  trimJobsAfterPopulationLoss() {
    const s = this.state;
    let totalAssigned = (s.jobsAssigned.unemployed || 0) + (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    while (totalAssigned > s.population) {
      if ((s.jobsAssigned.lumberjack || 0) > 0) {
        s.jobsAssigned.lumberjack--;
      } else if ((s.jobsAssigned.stonemason || 0) > 0) {
        s.jobsAssigned.stonemason--;
      } else if ((s.jobsAssigned.farmer || 0) > 0) {
        s.jobsAssigned.farmer--;
      } else {
        s.jobsAssigned.unemployed = Math.max(0, s.jobsAssigned.unemployed - 1);
      }
      totalAssigned = (s.jobsAssigned.unemployed || 0) + (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    }
  }

  logEvent(text) {
    const s = this.state;
    const time = new Date().toLocaleTimeString();
    s.events.unshift(`[${time}] ${text}`);
    if (s.events.length > 200) s.events.length = 200;
  }
}
