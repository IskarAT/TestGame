// game.js
import { TICKS_PER_SECOND, TICK_MS, RES, BUILDINGS, JOBS, createInitialState } from './data.js';

export class Game {
  constructor() {
    this.state = createInitialState();
    this.tickInterval = null;
    this.listeners = [];
    // constants
    this.foodPerPopPerSecond = 0.1; // food consumed per pop per second
    this.populationGrowthRatePerSecond = 0.2; // fraction of missing pop per second
    this.populationDeclineRatePerSecond = 0.5; // fraction of pop lost per second when starving severely
    this.jobBaseIncomePerSecond = {
      farmer: 0.5, // base food per farmer per second
      lumberjack: 0.3, // wood per second
      stonemason: 0.25 // stone per second
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

  // cost calculation for building type
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

  // check if cost exceeds storage capacity
  costExceedsStorage(cost) {
    for (const k of Object.keys(cost)) {
      if (k === RES.POP) continue;
      if ((cost[k] || 0) > (this.state.resourceMax[k] || 0)) return true;
    }
    return false;
  }

  build(buildingId) {
    const cost = this.getBuildCost(buildingId);
    // if cannot afford, do nothing
    if (!this.canAfford(cost)) return false;
    // subtract cost
    for (const r of Object.keys(cost)) {
      this.state.resources[r] = Math.max(0, (this.state.resources[r] || 0) - cost[r]);
    }
    // increment building
    this.state.buildings[buildingId] = (this.state.buildings[buildingId] || 0) + 1;
    // apply storage increase if storage room
    if (buildingId === 'storage') {
      const inc = BUILDINGS.storage.storageIncrease;
      for (const r of Object.keys(inc)) {
        this.state.resourceMax[r] = (this.state.resourceMax[r] || 0) + inc[r];
      }
    }
    // unlock jobs if needed
    const unlock = BUILDINGS[buildingId].unlocksJob;
    if (unlock) {
      this.state.unlockedJobs[unlock] = true;
      // ensure unemployed count updated (we'll recalc assignments on tick)
    }
    this.logEvent(`Built ${BUILDINGS[buildingId].name} (total: ${this.state.buildings[buildingId]})`);
    this.emitUpdate();
    return true;
  }

  // assign job (returns true if assigned)
  assignJob(jobId, amount=1) {
    const totalAssigned = Object.values(this.state.jobsAssigned).reduce((a,b)=>a+b,0);
    if (totalAssigned + amount > this.state.population) return false;
    if (jobId !== 'unemployed' && !this.state.unlockedJobs[jobId]) return false;
    this.state.jobsAssigned[jobId] = (this.state.jobsAssigned[jobId] || 0) + amount;
    // adjust unemployed
    this.state.jobsAssigned.unemployed = Math.max(0, this.state.population - (Object.values(this.state.jobsAssigned).reduce((a,b)=>a+b,0) - (this.state.jobsAssigned.unemployed||0)));
    this.emitUpdate();
    return true;
  }

  unassignJob(jobId, amount=1) {
    this.state.jobsAssigned[jobId] = Math.max(0, (this.state.jobsAssigned[jobId] || 0) - amount);
    this.emitUpdate();
  }

  // manual gather (used when job locked)
  manualGather(resourceKey, amount=1) {
    this.state.resources[resourceKey] = Math.min(this.state.resourceMax[resourceKey] || Infinity, (this.state.resources[resourceKey] || 0) + amount);
    this.emitUpdate();
  }

  // compute job boosts from buildings
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
    return boosts;
  }

  // compute flat yields from buildings (per second)
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

  // main tick
  tick() {
    this.state.ticks++;
    const s = this.state;
    const boosts = this.computeJobBoosts();
    const flatYieldsPerSecond = this.computeBuildingFlatYieldsPerSecond();

    // --- population capacity from houses
    const houses = s.buildings.house || 0;
    const popCap = houses * BUILDINGS.house.popCapacityPer;
    s.resourceMax[RES.POP] = popCap;

    // --- food upkeep per tick
    const foodUpkeepPerSecond = s.population * this.foodPerPopPerSecond;
    const foodUpkeepPerTick = foodUpkeepPerSecond / TICKS_PER_SECOND;

    // --- job incomes per tick
    const jobIncomePerTick = { food: 0, wood: 0, stone: 0 };
    // farmers
    const farmers = s.jobsAssigned.farmer || 0;
    const farmerBase = this.jobBaseIncomePerSecond.farmer;
    const farmerBoost = boosts.food || 0;
    jobIncomePerTick.food += (farmers * farmerBase * (1 + farmerBoost)) / TICKS_PER_SECOND;

    // lumberjacks
    const lumber = s.jobsAssigned.lumberjack || 0;
    const lumberBase = this.jobBaseIncomePerSecond.lumberjack;
    const lumberBoost = boosts.wood || 0;
    jobIncomePerTick.wood += (lumber * lumberBase * (1 + lumberBoost)) / TICKS_PER_SECOND;

    // stonemasons
    const masons = s.jobsAssigned.stonemason || 0;
    const masonBase = this.jobBaseIncomePerSecond.stonemason;
    const masonBoost = boosts.stone || 0;
    jobIncomePerTick.stone += (masons * masonBase * (1 + masonBoost)) / TICKS_PER_SECOND;

    // building flat yields (fields produce flat food)
    for (const k of Object.keys(flatYieldsPerSecond)) {
      jobIncomePerTick[k] = (jobIncomePerTick[k] || 0) + (flatYieldsPerSecond[k] / TICKS_PER_SECOND);
    }

    // --- food shortage effects
    // compute net food income per second (jobs + flat - upkeep)
    const netFoodPerSecond = (jobIncomePerTick.food * TICKS_PER_SECOND) - foodUpkeepPerSecond;
    // if food depleted (current food <= 0), non-farmers are 30% less effective
    let shortageMultiplier = 1.0;
    if (s.resources.food <= 0) shortageMultiplier = 0.7; // 30% less effective
    // apply shortage multiplier to non-farmers incomes
    jobIncomePerTick.wood *= (s.resources.food <= 0 ? 0.7 : 1.0);
    jobIncomePerTick.stone *= (s.resources.food <= 0 ? 0.7 : 1.0);
    // farmers unaffected

    // --- apply incomes/upkeeps to resources (per tick)
    // Food: add jobIncomePerTick.food, subtract upkeep
    const foodDelta = jobIncomePerTick.food - foodUpkeepPerTick;
    s.resources.food = Math.max(0, (s.resources.food || 0) + foodDelta);

    // Stone & Wood
    s.resources.wood = Math.max(0, (s.resources.wood || 0) + jobIncomePerTick.wood);
    s.resources.stone = Math.max(0, (s.resources.stone || 0) + jobIncomePerTick.stone);

    // clamp to max storage
    for (const r of [RES.WOOD, RES.STONE, RES.FOOD]) {
      if (s.resourceMax[r] !== undefined) {
        s.resources[r] = Math.min(s.resources[r], s.resourceMax[r]);
      }
    }

    // --- population growth/decline logic (accumulator)
    // If food is sufficient (netFoodPerSecond >= 0), population grows toward cap
    if (netFoodPerSecond >= 0) {
      const missing = Math.max(0, popCap - s.population);
      const growthPerSecond = missing * this.populationGrowthRatePerSecond;
      const growthPerTick = growthPerSecond / TICKS_PER_SECOND;
      s.popAccumulator += growthPerTick;
    } else {
      // if net food per second is below -2 * upkeep, population declines
      if (netFoodPerSecond < -2 * foodUpkeepPerSecond) {
        const declinePerSecond = s.population * this.populationDeclineRatePerSecond;
        const declinePerTick = declinePerSecond / TICKS_PER_SECOND;
        s.popAccumulator -= declinePerTick;
      } else {
        // small slowdown: no growth but no decline
      }
    }

    // apply integer population changes when accumulator crosses integer boundaries
    if (s.popAccumulator >= 1) {
      const whole = Math.floor(s.popAccumulator);
      const newPop = Math.min(popCap, s.population + whole);
      const applied = newPop - s.population;
      if (applied > 0) {
        s.population = newPop;
        s.popAccumulator -= applied;
        this.logEvent(`Population increased by ${applied} (now ${s.population})`);
      } else {
        // reached cap, reset accumulator
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
        // when population dies, ensure assigned jobs do not exceed population
        this.trimJobsAfterPopulationLoss();
      } else {
        s.popAccumulator = 0;
      }
    }

    // ensure integer population stored
    s.population = Math.floor(s.population);

    // ensure unemployed count equals population minus assigned jobs
    const assignedNonUnemployed = (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    s.jobsAssigned.unemployed = Math.max(0, s.population - assignedNonUnemployed);

    // clamp resources to non-negative
    for (const k of Object.keys(s.resources)) {
      if (s.resources[k] < 0) s.resources[k] = 0;
    }

    this.emitUpdate();
  }

  // when population dies, remove assigned jobs if needed
  trimJobsAfterPopulationLoss() {
    const s = this.state;
    let totalAssigned = (s.jobsAssigned.unemployed || 0) + (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    // if totalAssigned > population, remove assignments
    while (totalAssigned > s.population) {
      // prefer to remove non-farmers first
      if ((s.jobsAssigned.lumberjack || 0) > 0) {
        s.jobsAssigned.lumberjack--;
      } else if ((s.jobsAssigned.stonemason || 0) > 0) {
        s.jobsAssigned.stonemason--;
      } else if ((s.jobsAssigned.farmer || 0) > 0) {
        // only remove farmers if no other jobs to remove
        s.jobsAssigned.farmer--;
      } else {
        // reduce unemployed if somehow > population
        s.jobsAssigned.unemployed = Math.max(0, s.jobsAssigned.unemployed - 1);
      }
      totalAssigned = (s.jobsAssigned.unemployed || 0) + (s.jobsAssigned.farmer || 0) + (s.jobsAssigned.lumberjack || 0) + (s.jobsAssigned.stonemason || 0);
    }
  }

  logEvent(text) {
    const s = this.state;
    const time = new Date().toLocaleTimeString();
    s.events.unshift(`[${time}] ${text}`);
    // keep log length reasonable
    if (s.events.length > 200) s.events.length = 200;
  }
}
