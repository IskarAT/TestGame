// ui.js
import { Game } from './game.js';
import { BUILDINGS, RES, JOBS, TICKS_PER_SECOND, UPGRADES } from './data.js';

let game = new Game();
const tooltip = document.getElementById('tooltip');

function $(id){ return document.getElementById(id); }
function formatNumber(n, decimals=2){
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(decimals);
}

/* ---------- Resources ---------- */

function createResourceRow(key, label) {
  const row = document.createElement('div');
  row.className = 'resource-row';
  row.dataset.key = key;

  const left = document.createElement('div');
  left.innerHTML = `<div class="resource-name">${label}</div><div class="small-muted resource-stats" data-storage></div>`;
  const right = document.createElement('div');
  right.innerHTML = `<div class="resource-stats" data-gain></div><div class="resource-stats" data-current></div>`;

  row.appendChild(left);
  row.appendChild(right);

  row.querySelector('[data-storage]').addEventListener('mouseenter', (e) => {
    showTooltip(e, () => {
      const s = game.state;
      if (key === RES.POP) return `Population capacity from houses: ${s.resourceMax[RES.POP]}`;
      const base = { wood: 200, stone: 200, food: 200 }[key] || 0;
      const storageRooms = s.buildings.storage || 0;
      const inc = storageRooms * (BUILDINGS.storage.storageIncrease[key] || 0);
      const extra = storageRooms * (game.storageExtraPerRoom ? game.storageExtraPerRoom() : 0);
      return `Storage: base ${base}; storage rooms ${storageRooms} (+${inc + extra})`;
    });
  });
  row.querySelector('[data-storage]').addEventListener('mouseleave', hideTooltip);

  row.querySelector('[data-gain]').addEventListener('mouseenter', (e) => {
    showTooltip(e, () => {
      const s = game.state;
      if (key === RES.FOOD) {
        const foodUpkeepPerSecond = s.population * game.foodPerPopPerSecond();
        return `Food upkeep: ${formatNumber(foodUpkeepPerSecond)}/s (population ${s.population})`;
      }
      const jobContrib = {
        wood: s.jobsAssigned.lumberjack || 0,
        stone: s.jobsAssigned.stonemason || 0
      }[key] || 0;
      return `Jobs contributing: ${jobContrib}`;
    });
  });
  row.querySelector('[data-gain]').addEventListener('mouseleave', hideTooltip);

  return row;
}

function renderResources() {
  const container = $('resource-list');
  container.innerHTML = '';
  const labels = {
    [RES.POP]: 'Population',
    [RES.WOOD]: 'Wood',
    [RES.STONE]: 'Stone',
    [RES.FOOD]: 'Food'
  };
  for (const key of [RES.POP, RES.WOOD, RES.STONE, RES.FOOD]) {
    const row = createResourceRow(key, labels[key]);
    container.appendChild(row);
  }
  updateResources();
}

function updateResources() {
  const s = game.state;
  for (const row of document.querySelectorAll('.resource-row')) {
    const key = row.dataset.key;
    const currentEl = row.querySelector('[data-current]');
    const gainEl = row.querySelector('[data-gain]');
    const storageEl = row.querySelector('[data-storage]');

    if (key === RES.POP) {
      currentEl.textContent = `${s.population} / ${s.resourceMax[RES.POP]}`;
      currentEl.className = '';
      if (s.population < s.resourceMax[RES.POP]) currentEl.classList.add('yellow');
      gainEl.textContent = `accum: ${formatNumber(s.popAccumulator,3)}`;
      storageEl.textContent = `Capacity from houses: ${s.resourceMax[RES.POP]}`;
      continue;
    }

    const cur = s.resources[key] || 0;
    const max = s.resourceMax[key] || 0;

    const boosts = game.computeJobBoosts();
    const flatYields = game.computeBuildingFlatYieldsPerSecond();
    let perSecond = 0;
    if (key === RES.FOOD) {
      const farmers = s.jobsAssigned.farmer || 0;
      perSecond += farmers * game.jobBaseIncomePerSecond.farmer * (1 + (boosts.food || 0));
      perSecond += (flatYields.food || 0);
      perSecond -= s.population * game.foodPerPopPerSecond();
    } else if (key === RES.WOOD) {
      const lumber = s.jobsAssigned.lumberjack || 0;
      perSecond += lumber * game.jobBaseIncomePerSecond.lumberjack * (1 + (boosts.wood || 0));
      perSecond += (flatYields.wood || 0);
    } else if (key === RES.STONE) {
      const masons = s.jobsAssigned.stonemason || 0;
      perSecond += masons * game.jobBaseIncomePerSecond.stonemason * (1 + (boosts.stone || 0));
      perSecond += (flatYields.stone || 0);
    }

    gainEl.textContent = `${perSecond >= 0 ? '+' : ''}${formatNumber(perSecond,2)}/s`;
    gainEl.className = perSecond > 0 ? 'resource-stats gain-positive' : (perSecond < 0 ? 'resource-stats gain-negative' : 'resource-stats');

    currentEl.textContent = `${formatNumber(cur,2)} / ${max}`;
    currentEl.className = 'resource-stats';
    if (cur === 0 || cur === max) currentEl.classList.add('resource-zero');
    storageEl.textContent = `Max: ${max}`;
  }
}

/* ---------- Buildings ---------- */

function createBuildingCell(bId) {
  const b = BUILDINGS[bId];
  const cell = document.createElement('div');
  cell.className = 'building-cell';
  const name = document.createElement('div');
  name.className = 'building-name';
  name.textContent = b.name;
  const desc = document.createElement('div');
  desc.className = 'building-desc';
  desc.textContent = b.desc;
  const controls = document.createElement('div');
  controls.className = 'building-controls';
  const count = document.createElement('div');
  count.className = 'small-muted';
  count.textContent = `Owned: 0`;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Build';
  // No title attribute to avoid overlapping tooltip
  btn.addEventListener('mouseenter', (e) => {
    showTooltip(e, () => {
      const cost = game.getBuildCost(bId);
      // each resource on separate line, capitalized
      return Object.keys(cost).map(k => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${cost[k]}`).join('\n');
    });
  });
  btn.addEventListener('mouseleave', hideTooltip);
  btn.addEventListener('click', () => {
    const success = game.build(bId);
    if (!success) {
      btn.style.transform = 'scale(0.98)';
      setTimeout(()=>btn.style.transform='',120);
    }
    renderAll();
  });

  controls.appendChild(count);
  controls.appendChild(btn);

  cell.appendChild(name);
  cell.appendChild(desc);
  cell.appendChild(controls);

  cell._count = count;
  cell._btn = btn;
  cell._id = bId;
  return cell;
}

function renderBuildings() {
  const grid = $('building-grid');
  grid.innerHTML = '';
  const order = ['house','storage','forester','quarry','fields'];
  for (const id of order) {
    const cell = createBuildingCell(id);
    grid.appendChild(cell);
  }
  updateBuildings();
}

function updateBuildings() {
  const s = game.state;
  const grid = $('building-grid');
  if (!grid) return;
  const cells = grid.querySelectorAll('.building-cell');
  cells.forEach(cell => {
    const id = cell._id;
    const count = s.buildings[id] || 0;
    cell._count.textContent = `Owned: ${count}`;
    const cost = game.getBuildCost(id);
    const canAfford = game.canAfford(cost);
    const exceedsStorage = game.costExceedsStorage(cost);
    if (exceedsStorage) {
      cell._btn.style.color = 'var(--danger)';
    } else if (!canAfford) {
      cell._btn.style.color = 'var(--yellow)';
    } else {
      cell._btn.style.color = 'var(--accent)';
    }
  });
}

/* ---------- Jobs ---------- */

function createJobRow(jobId, label) {
  const row = document.createElement('div');
  row.className = 'job-row';
  row.dataset.job = jobId;
  const left = document.createElement('div');
  left.innerHTML = `<div class="job-name">${label}</div><div class="small-muted job-desc" data-desc></div>`;
  const right = document.createElement('div');
  right.className = 'job-controls';
  right.innerHTML = `<div class="small-muted" data-count>0</div>`;
  const assignBtn = document.createElement('button');
  assignBtn.className = 'btn assign-plus';
  assignBtn.textContent = '+';
  const unassignBtn = document.createElement('button');
  unassignBtn.className = 'btn assign-minus';
  unassignBtn.textContent = '-';
  right.appendChild(assignBtn);
  right.appendChild(unassignBtn);

  const gatherBtn = document.createElement('button');
  gatherBtn.className = 'btn gather';
  gatherBtn.textContent = 'Gather';
  gatherBtn.style.marginLeft = '8px';
  right.appendChild(gatherBtn);

  row.appendChild(left);
  row.appendChild(right);

  row.addEventListener('mouseenter', (e) => {
    showTooltip(e, () => {
      const s = game.state;
      const assigned = s.jobsAssigned[jobId] || 0;
      let income = 0;
      if (jobId === 'farmer') income = game.jobBaseIncomePerSecond.farmer * (1 + (game.computeJobBoosts().food || 0));
      if (jobId === 'lumberjack') income = game.jobBaseIncomePerSecond.lumberjack * (1 + (game.computeJobBoosts().wood || 0));
      if (jobId === 'stonemason') income = game.jobBaseIncomePerSecond.stonemason * (1 + (game.computeJobBoosts().stone || 0));
      return `${JOBS[jobId].desc}\nAssigned: ${assigned}\nIncome per worker: ${formatNumber(income)}/s`;
    });
  });
  row.addEventListener('mouseleave', hideTooltip);

  assignBtn.addEventListener('click', () => {
    const s = game.state;
    if (!s.unlockedJobs[jobId]) return;
    const assignedNonUnemployed = (s.jobsAssigned.farmer || 0)
      + (s.jobsAssigned.lumberjack || 0)
      + (s.jobsAssigned.stonemason || 0);
    if (assignedNonUnemployed < s.population) {
      game.assignJob(jobId, 1);
      renderAll();
    }
  });

  unassignBtn.addEventListener('click', () => {
    const s = game.state;
    if ((s.jobsAssigned[jobId] || 0) > 0) {
      game.unassignJob(jobId, 1);
      renderAll();
    }
  });

  gatherBtn.addEventListener('click', () => {
    if (jobId === 'farmer') game.manualGather(RES.FOOD, 5);
    if (jobId === 'lumberjack') game.manualGather(RES.WOOD, 5);
    if (jobId === 'stonemason') game.manualGather(RES.STONE, 5);
    renderAll();
  });

  row._count = row.querySelector('[data-count]');
  row._gather = gatherBtn;
  row._plus = assignBtn;
  row._minus = unassignBtn;
  return row;
}

function renderJobs() {
  const container = $('job-list');
  container.innerHTML = '';
  const unemployedRow = createJobRow('unemployed', 'Unemployed');
  unemployedRow.querySelector('.job-desc').textContent = JOBS.unemployed.desc;
  const controls = unemployedRow.querySelector('.job-controls');
  const plus = controls.querySelector('.assign-plus');
  const minus = controls.querySelector('.assign-minus');
  const gather = controls.querySelector('.gather');
  if (plus) controls.removeChild(plus);
  if (minus) controls.removeChild(minus);
  if (gather) controls.removeChild(gather);
  container.appendChild(unemployedRow);

  const order = ['farmer','lumberjack','stonemason'];
  for (const id of order) {
    const row = createJobRow(id, JOBS[id].name);
    row.querySelector('.job-desc').textContent = JOBS[id].desc;
    container.appendChild(row);
  }
  updateJobs();
}

function updateJobs() {
  const s = game.state;
  for (const row of document.querySelectorAll('.job-row')) {
    const jobId = row.dataset.job;
    const assigned = s.jobsAssigned[jobId] || 0;
    row._count.textContent = assigned;
    if (jobId === 'unemployed') {
      row._count.textContent = s.jobsAssigned.unemployed || 0;
      continue;
    }
    let unlockBuilding = null;
    if (jobId === 'farmer') unlockBuilding = 'fields';
    if (jobId === 'lumberjack') unlockBuilding = 'forester';
    if (jobId === 'stonemason') unlockBuilding = 'quarry';
    const buildingCount = s.buildings[unlockBuilding] || 0;
    const unlocked = s.unlockedJobs[jobId] || false;

    if (buildingCount === 0) {
      row._gather.style.display = 'inline-block';
      row._plus.style.display = 'none';
      row._minus.style.display = 'none';
    } else {
      row._gather.style.display = 'none';
      if (unlocked) {
        row._plus.style.display = 'inline-block';
        row._minus.style.display = 'inline-block';
      } else {
        row._plus.style.display = 'none';
        row._minus.style.display = 'none';
        row._gather.style.display = 'inline-block';
      }
    }
  }
}

/* ---------- Upgrades ---------- */

function createUpgradeCell(upgId) {
  const u = UPGRADES[upgId];
  const cell = document.createElement('div');
  cell.className = 'building-cell';
  const name = document.createElement('div');
  name.className = 'building-name';
  name.textContent = u.name;
  const desc = document.createElement('div');
  desc.className = 'building-desc';
  desc.textContent = u.desc;
  const controls = document.createElement('div');
  controls.className = 'building-controls';
  const count = document.createElement('div');
  count.className = 'small-muted';
  count.textContent = `Level: 0`;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Upgrade';
  btn.addEventListener('mouseenter', (e) => {
    showTooltip(e, () => {
      const cost = game.getUpgradeCost(upgId);
      return Object.keys(cost).map(k => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${cost[k]}`).join('\n');
    });
  });
  btn.addEventListener('mouseleave', hideTooltip);
  btn.addEventListener('click', () => {
    const exceeds = game.upgradeCostExceedsStorage(upgId);
    const canAfford = game.canAffordUpgrade(upgId);
    if (exceeds || !canAfford) {
      btn.style.transform = 'scale(0.98)';
      setTimeout(()=>btn.style.transform='',120);
      return;
    }
    const success = game.buyUpgrade(upgId);
    if (success) {
      renderAll();
    }
  });

  controls.appendChild(count);
  controls.appendChild(btn);

  cell.appendChild(name);
  cell.appendChild(desc);
  cell.appendChild(controls);

  cell._count = count;
  cell._btn = btn;
  cell._id = upgId; // ensure _id is set so updateUpgrades can map correctly
  return cell;
}

function renderUpgrades() {
  const grid = $('upgrade-grid');
  grid.innerHTML = '';
  for (const id of Object.keys(UPGRADES)) {
    const cell = createUpgradeCell(id);
    grid.appendChild(cell);
  }
  updateUpgrades();
  const allBought = Object.keys(UPGRADES).every(k => {
    const max = UPGRADES[k].maxPurchases;
    const bought = game.state.upgradesPurchased[k] || 0;
    return bought >= max;
  });
  $('upgrades-empty').style.display = allBought ? 'block' : 'none';
}

function updateUpgrades() {
  const s = game.state;
  const grid = $('upgrade-grid');
  if (!grid) return;
  const cells = grid.querySelectorAll('.building-cell');
  cells.forEach(cell => {
    const id = cell._id;
    if (!id) return;
    const bought = s.upgradesPurchased[id] || 0;
    cell._count.textContent = `Level: ${bought}`;
    const max = UPGRADES[id].maxPurchases;
    if (bought >= max) {
      cell.style.display = 'none';
      return;
    } else {
      cell.style.display = '';
    }
    const cost = game.getUpgradeCost(id);
    const canAfford = game.canAfford(cost);
    const exceeds = game.costExceedsStorage(cost);
    if (exceeds) {
      cell._btn.style.color = 'var(--danger)';
    } else if (!canAfford) {
      cell._btn.style.color = 'var(--yellow)';
    } else {
      cell._btn.style.color = 'var(--accent)';
    }
  });
}

/* ---------- Event log ---------- */

function renderLog() {
  const el = $('event-log');
  el.innerHTML = '';
  for (const e of game.state.events.slice(0,200)) {
    const div = document.createElement('div');
    div.textContent = e;
    el.appendChild(div);
  }
}

/* ---------- Tooltip ---------- */

function showTooltip(e, contentFn) {
  const text = contentFn();
  tooltip.style.display = 'block';
  tooltip.textContent = text;
  positionTooltip(e);
}
function hideTooltip() { tooltip.style.display = 'none'; }
function positionTooltip(e) {
  const x = (e.clientX || (e.touches && e.touches[0].clientX)) + 12;
  const y = (e.clientY || (e.touches && e.touches[0].clientY)) + 12;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
document.addEventListener('mousemove', (e) => {
  if (tooltip.style.display === 'block') positionTooltip(e);
});

/* ---------- Controls ---------- */

function wireControls() {
  const pauseBtn = $('pause-btn');
  const resetBtn = $('reset-btn');
  const tickRateEl = $('tick-rate');
  if (tickRateEl) tickRateEl.textContent = TICKS_PER_SECOND;

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (game.tickInterval) {
        game.stop();
        pauseBtn.textContent = 'Unpause';
      } else {
        game.start();
        pauseBtn.textContent = 'Pause';
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetGame();
    });
  }
}

/* ---------- Lifecycle ---------- */

function resetGame() {
  if (game) {
    try { game.stop(); } catch(e){ }
  }
  game = new Game();
  game.onUpdate(() => renderAll());
  game.start();
  renderAll();
}

function renderAll() {
  updateResources();
  updateBuildings();
  updateJobs();
  renderUpgrades();
  renderLog();
}

function init() {
  renderResources();
  renderBuildings();
  renderJobs();
  renderUpgrades();
  renderLog();
  wireControls();

  game.onUpdate(() => renderAll());
  game.start();
}

init();
