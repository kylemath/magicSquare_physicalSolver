import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  centeredHeight,
  cloneSquare,
  isMagic,
  latticeCoordinate,
} from "./math.js";
import { randomSquare } from "./generators.js";
import { classOptions, recordsFor } from "./squareData.js";

const elements = {
  orderSelect: document.querySelector("#orderSelect"),
  classSelect: document.querySelector("#classSelect"),
  sampleSlider: document.querySelector("#sampleSlider"),
  sampleLabel: document.querySelector("#sampleLabel"),
  swapSlider: document.querySelector("#swapSlider"),
  swapLabel: document.querySelector("#swapLabel"),
  fieldStrength: document.querySelector("#fieldStrength"),
  repulsion: document.querySelector("#repulsion"),
  wellStrength: document.querySelector("#wellStrength"),
  temperature: document.querySelector("#temperature"),
  cooling: document.querySelector("#cooling"),
  swapsPerFrame: document.querySelector("#swapsPerFrame"),
  heightScale: document.querySelector("#heightScale"),
  memory: document.querySelector("#memory"),
  landscapeSamples: document.querySelector("#landscapeSamples"),
  resetButton: document.querySelector("#resetButton"),
  pauseButton: document.querySelector("#pauseButton"),
  stats: document.querySelector("#stats"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: [...document.querySelectorAll(".tab-panel")],
  filingsCanvas: document.querySelector("#filingsCanvas"),
  bubblesCanvas: document.querySelector("#bubblesCanvas"),
  spinsCanvas: document.querySelector("#spinsCanvas"),
  annealingCanvas: document.querySelector("#annealingCanvas"),
  landscapeCanvas: document.querySelector("#landscapeCanvas"),
  orbitHost: document.querySelector("#orbitHost"),
};

const state = {
  order: 4,
  kind: "magic",
  sample: 0,
  swapCount: 4,
  activeTab: "filings",
  paused: false,
  tick: 0,
};

const filings = {
  particles: [],
};

const bubbles = {
  particles: [],
  inducedSquare: null,
  energyHistory: [],
};

const anneal = {
  square: null,
  energyHistory: [],
  accepted: 0,
  attempted: 0,
  bestEnergy: Infinity,
  lastSwap: null,
};

const orbit = {
  initialized: false,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  bodies: [],
  clock: new THREE.Clock(),
};

installListeners();
refreshClassOptions();
resetSimulations();
requestAnimationFrame(loop);

function installListeners() {
  elements.orderSelect.addEventListener("change", () => {
    state.order = Number(elements.orderSelect.value);
    state.sample = 0;
    refreshClassOptions();
    resetSimulations();
  });
  elements.classSelect.addEventListener("change", () => {
    state.kind = elements.classSelect.value;
    state.sample = 0;
    resetSimulations();
  });
  elements.sampleSlider.addEventListener("input", () => {
    state.sample = Number(elements.sampleSlider.value);
    resetSimulations();
  });
  elements.swapSlider.addEventListener("input", () => {
    state.swapCount = Number(elements.swapSlider.value);
    elements.swapLabel.textContent = String(state.swapCount);
    if (state.kind.startsWith("swap")) resetSimulations();
  });
  elements.resetButton.addEventListener("click", resetSimulations);
  elements.pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    elements.pauseButton.textContent = state.paused ? "Resume" : "Pause";
  });
  elements.tabs.forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab;
      elements.tabs.forEach((tab) => tab.classList.toggle("active", tab === button));
      elements.panels.forEach((panel) =>
        panel.classList.toggle("active", panel.id === `${state.activeTab}Panel`),
      );
      if (state.activeTab === "orbitals") ensureOrbit();
      renderActiveTab();
    });
  });
  [
    elements.fieldStrength,
    elements.repulsion,
    elements.wellStrength,
    elements.temperature,
    elements.cooling,
    elements.swapsPerFrame,
    elements.heightScale,
    elements.memory,
    elements.landscapeSamples,
  ].forEach((input) => input.addEventListener("input", renderActiveTab));
  window.addEventListener("resize", resizeOrbit);
}

function refreshClassOptions() {
  const options = classOptions(state.order);
  elements.classSelect.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  if (!options.some((option) => option.value === state.kind)) state.kind = "magic";
  elements.classSelect.value = state.kind;
}

function currentRecord() {
  const records = recordsFor(state.order, state.kind, state.swapCount);
  state.sample = Math.min(state.sample, Math.max(0, records.length - 1));
  elements.sampleSlider.max = String(Math.max(0, records.length - 1));
  elements.sampleSlider.value = String(state.sample);
  elements.sampleLabel.textContent = `${state.sample + 1}/${records.length}`;
  elements.swapLabel.textContent = String(state.swapCount);
  return records[state.sample];
}

function currentSquare() {
  return currentRecord().square;
}

function resetSimulations() {
  const square = currentSquare();
  state.tick = 0;
  seedFilings(220);
  seedBubbles(square);
  anneal.square = cloneSquare(state.kind === "magic" ? randomSquare(square.length, 7719 + square.length) : square);
  anneal.energyHistory = [];
  anneal.accepted = 0;
  anneal.attempted = 0;
  anneal.bestEnergy = lineEnergy(anneal.square).completeEnergy;
  anneal.lastSwap = null;
  rebuildOrbit();
  renderActiveTab();
}

function loop() {
  requestAnimationFrame(loop);
  if (!state.paused) {
    state.tick += 1;
    if (state.activeTab === "bubbles") stepBubbles();
    if (state.activeTab === "annealing") stepAnnealing();
    if (state.activeTab === "orbitals") stepOrbit();
  }
  if (state.tick % 2 === 0) renderActiveTab();
  renderStats();
}

function renderActiveTab() {
  const square = currentSquare();
  if (state.activeTab === "filings") drawFilings(square);
  if (state.activeTab === "bubbles") drawBubbles();
  if (state.activeTab === "spins") drawSpins(square);
  if (state.activeTab === "annealing") drawAnnealing();
  if (state.activeTab === "landscape") drawLandscape(square);
  if (state.activeTab === "orbitals") ensureOrbit();
}

function lineEnergy(square) {
  const n = square.length;
  const rows = Array.from({ length: n }, (_, row) =>
    sum(Array.from({ length: n }, (_, col) => centeredHeight(square[row][col], n))),
  );
  const cols = Array.from({ length: n }, (_, col) =>
    sum(Array.from({ length: n }, (_, row) => centeredHeight(square[row][col], n))),
  );
  const diags = [
    sum(Array.from({ length: n }, (_, i) => centeredHeight(square[i][i], n))),
    sum(Array.from({ length: n }, (_, i) => centeredHeight(square[i][n - 1 - i], n))),
  ];
  const all = [...rows, ...cols, ...diags];
  return {
    rows,
    cols,
    diags,
    all,
    completeEnergy: sum(all.map((value) => value * value)),
    maxResidual: Math.max(...all.map((value) => Math.abs(value))),
    lowModeEnergy: lowModeEnergy(square),
    highModeEnergy: highModeEnergy(rows) + highModeEnergy(cols),
  };
}

function lineForceAtCell(analysis, row, col) {
  const n = analysis.rows.length;
  let force = analysis.rows[row] + analysis.cols[col];
  if (row === col) force += analysis.diags[0];
  if (row + col === n - 1) force += analysis.diags[1];
  return force;
}

function drawFilings(square) {
  const canvas = elements.filingsCanvas;
  const ctx = resetCanvas(canvas, true);
  const n = square.length;
  const analysis = lineEnergy(square);
  const bounds = squareBounds(canvas, n);
  drawSquareField(ctx, square, analysis, bounds);
  const strength = Number(elements.fieldStrength.value);
  const memory = Number(elements.memory.value);

  for (const particle of filings.particles) {
    const field = continuousField(particle.x, particle.y, analysis, bounds);
    const angle = Math.atan2(field.y, field.x);
    particle.angle = interpolateAngle(particle.angle, angle, 1 - memory);
    particle.x += Math.cos(particle.angle) * strength * 0.55;
    particle.y += Math.sin(particle.angle) * strength * 0.55;
    if (!inside(particle, bounds)) resetParticle(particle, bounds);

    ctx.strokeStyle = "rgba(238,241,234,0.55)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(particle.x - Math.cos(particle.angle) * 8, particle.y - Math.sin(particle.angle) * 8);
    ctx.lineTo(particle.x + Math.cos(particle.angle) * 8, particle.y + Math.sin(particle.angle) * 8);
    ctx.stroke();
  }
  drawEnergyBadge(ctx, analysis, "filings align with line-charge field");
}

function seedBubbles(square) {
  const n = square.length;
  bubbles.particles = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const value = square[row][col];
      bubbles.particles.push({
        value,
        charge: centeredHeight(value, n),
        x: col + 0.5 + (Math.random() - 0.5) * 0.05,
        y: row + 0.5 + (Math.random() - 0.5) * 0.05,
        vx: 0,
        vy: 0,
      });
    }
  }
  bubbles.inducedSquare = inducedSquareFromBubbles(n);
  bubbles.energyHistory = [];
}

function stepBubbles() {
  if (!bubbles.particles.length) return;
  const n = currentSquare().length;
  const analysis = lineEnergy(bubbles.inducedSquare ?? currentSquare());
  const fieldStrength = Number(elements.fieldStrength.value) * 0.00085;
  const repulsion = Number(elements.repulsion.value) * 0.004;
  const wellStrength = Number(elements.wellStrength.value) * 0.0025;
  const damping = 0.9 + Number(elements.memory.value) * 0.08;
  const dt = 1;

  for (const p of bubbles.particles) {
    let fx = 0;
    let fy = 0;
    const col = Math.max(0, Math.min(n - 1, Math.floor(p.x)));
    const row = Math.max(0, Math.min(n - 1, Math.floor(p.y)));
    const forceSign = p.charge;

    analysis.cols.forEach((rho, index) => {
      const dx = p.x - (index + 0.5);
      fx += (-forceSign * rho * dx) / (0.35 + dx * dx);
    });
    analysis.rows.forEach((rho, index) => {
      const dy = p.y - (index + 0.5);
      fy += (-forceSign * rho * dy) / (0.35 + dy * dy);
    });
    const dMain = p.y - p.x;
    const dAnti = p.y + p.x - n;
    fx += forceSign * analysis.diags[0] * dMain * 0.12;
    fy += -forceSign * analysis.diags[0] * dMain * 0.12;
    fx += -forceSign * analysis.diags[1] * dAnti * 0.12;
    fy += -forceSign * analysis.diags[1] * dAnti * 0.12;

    fx *= fieldStrength;
    fy *= fieldStrength;

    fx += ((col + 0.5) - p.x) * wellStrength;
    fy += ((row + 0.5) - p.y) * wellStrength;

    for (const q of bubbles.particles) {
      if (p === q) continue;
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      const r2 = dx * dx + dy * dy + 0.025;
      const push = repulsion / (r2 * Math.sqrt(r2));
      fx += dx * push;
      fy += dy * push;
    }

    p.vx = (p.vx + fx * dt) * damping;
    p.vy = (p.vy + fy * dt) * damping;
  }

  for (const p of bubbles.particles) {
    p.x = Math.max(0.08, Math.min(n - 0.08, p.x + p.vx));
    p.y = Math.max(0.08, Math.min(n - 0.08, p.y + p.vy));
  }
  bubbles.inducedSquare = inducedSquareFromBubbles(n);
  bubbles.energyHistory.push(lineEnergy(bubbles.inducedSquare).completeEnergy);
  if (bubbles.energyHistory.length > 140) bubbles.energyHistory.shift();
}

function drawBubbles() {
  const canvas = elements.bubblesCanvas;
  const ctx = resetCanvas(canvas, true);
  const n = currentSquare().length;
  const square = bubbles.inducedSquare ?? currentSquare();
  const analysis = lineEnergy(square);
  const bounds = squareBounds(canvas, n, 0.72);
  drawSquareField(ctx, square, analysis, bounds);
  const cell = bounds.size / n;
  const maxCharge = n * n - 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.left, bounds.top, bounds.size, bounds.size);
  ctx.clip();
  for (const p of bubbles.particles) {
    const x = bounds.left + p.x * cell;
    const y = bounds.top + p.y * cell;
    const radius = Math.max(7, cell * (0.13 + 0.11 * Math.abs(p.charge) / maxCharge));
    const gradient = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, radius * 0.2, x, y, radius);
    const positive = p.charge >= 0;
    gradient.addColorStop(0, positive ? "rgba(160,220,230,0.95)" : "rgba(232,154,125,0.95)");
    gradient.addColorStop(1, positive ? "rgba(109,170,184,0.38)" : "rgba(200,105,88,0.38)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = positive ? "rgba(109,170,184,0.9)" : "rgba(200,105,88,0.9)";
    ctx.stroke();
    ctx.fillStyle = "#eef1ea";
    ctx.font = `${Math.max(10, radius * 0.75)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.value), x, y);
  }
  ctx.restore();

  drawEnergyChart(ctx, bubbles.energyHistory, canvas.width * 0.58, 76, canvas.width * 0.36, canvas.height - 160);
  drawEnergyBadge(ctx, analysis, "continuous bubbles induce nearest-cell square");
}

function inducedSquareFromBubbles(n) {
  const assignments = [];
  for (let particleIndex = 0; particleIndex < bubbles.particles.length; particleIndex += 1) {
    const p = bubbles.particles[particleIndex];
    for (let row = 0; row < n; row += 1) {
      for (let col = 0; col < n; col += 1) {
        const dx = p.x - (col + 0.5);
        const dy = p.y - (row + 0.5);
        assignments.push({ particleIndex, row, col, d2: dx * dx + dy * dy });
      }
    }
  }
  assignments.sort((a, b) => a.d2 - b.d2);
  const usedParticles = new Set();
  const usedCells = new Set();
  const square = Array.from({ length: n }, () => Array(n).fill(0));
  for (const item of assignments) {
    const cellKey = `${item.row},${item.col}`;
    if (usedParticles.has(item.particleIndex) || usedCells.has(cellKey)) continue;
    usedParticles.add(item.particleIndex);
    usedCells.add(cellKey);
    square[item.row][item.col] = bubbles.particles[item.particleIndex].value;
    if (usedParticles.size === n * n) break;
  }
  return square;
}

function drawSpins(square) {
  const canvas = elements.spinsCanvas;
  const ctx = resetCanvas(canvas, true);
  const n = square.length;
  const analysis = lineEnergy(square);
  const bounds = squareBounds(canvas, n);
  const cell = bounds.size / n;
  drawSquareField(ctx, square, analysis, bounds);
  const maxForce = Math.max(1, ...Array.from({ length: n * n }, (_, index) =>
    Math.abs(lineForceAtCell(analysis, Math.floor(index / n), index % n)),
  ));

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const cx = bounds.left + (col + 0.5) * cell;
      const cy = bounds.top + (row + 0.5) * cell;
      const force = lineForceAtCell(analysis, row, col);
      const z = centeredHeight(square[row][col], n);
      const angle = Math.atan2(force / maxForce, z / (n * n));
      const length = cell * 0.32;
      ctx.strokeStyle = force >= 0 ? "#6daab8" : "#c86958";
      ctx.lineWidth = Math.max(2, cell * 0.035);
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * length, cy - Math.sin(angle) * length);
      ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length, Math.max(3, cell * 0.045), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawEnergyBadge(ctx, analysis, "spin frustration = local line-force");
}

function ensureOrbit() {
  if (!orbit.initialized) initOrbit();
}

function initOrbit() {
  orbit.scene = new THREE.Scene();
  orbit.scene.background = new THREE.Color(0x07090a);
  orbit.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 160);
  orbit.camera.position.set(12, 11, 16);
  orbit.renderer = new THREE.WebGLRenderer({ antialias: true });
  orbit.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  elements.orbitHost.appendChild(orbit.renderer.domElement);
  orbit.controls = new OrbitControls(orbit.camera, orbit.renderer.domElement);
  orbit.controls.enableDamping = true;
  orbit.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(8, 12, 11);
  orbit.scene.add(light);
  orbit.scene.add(new THREE.AxesHelper(6));
  orbit.scene.add(new THREE.GridHelper(10, 10, 0x313b40, 0x20282c));
  orbit.initialized = true;
  rebuildOrbit();
  resizeOrbit();
}

function rebuildOrbit() {
  if (!orbit.initialized) return;
  orbit.bodies.forEach((body) => {
    orbit.scene.remove(body.mesh, body.line, body.shell);
  });
  orbit.bodies = [];
  const square = currentSquare();
  const analysis = lineEnergy(square);
  const n = square.length;
  const heightScale = Number(elements.heightScale.value);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const z = centeredHeight(square[row][col], n);
      const base = new THREE.Vector3(
        latticeCoordinate(col, n),
        -latticeCoordinate(row, n),
        z * heightScale,
      );
      const radius = base.length();
      const force = lineForceAtCell(analysis, row, col);
      const color = force >= 0 ? 0x6daab8 : 0xc86958;
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 30, 14),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.025, wireframe: true }),
      );
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.11 + Math.min(0.16, Math.abs(force) / 160), 18, 12),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.14 }),
      );
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 }),
      );
      orbit.scene.add(shell, mesh, line);
      orbit.bodies.push({
        row,
        col,
        base,
        radius,
        mesh,
        line,
        shell,
        axis: new THREE.Vector3(Math.sin(row + 1.2), Math.cos(col + 1.5), Math.sin(row + col + 0.5)).normalize(),
        speed: 0.2 + Math.abs(z) / (n * n) + Math.abs(force) / Math.max(1, analysis.maxResidual * 3),
        phase: row * 0.43 + col * 0.61,
      });
    }
  }
}

function stepOrbit() {
  ensureOrbit();
  orbit.controls.update();
  const t = performance.now() / 1000;
  const heightScale = Number(elements.heightScale.value);
  const square = currentSquare();
  orbit.bodies.forEach((body) => {
    const q = new THREE.Quaternion().setFromAxisAngle(body.axis, t * body.speed);
    const position = body.base.clone();
    position.z = centeredHeight(square[body.row][body.col], square.length) * heightScale;
    position.applyQuaternion(q);
    position.normalize().multiplyScalar(body.radius);
    body.mesh.position.copy(position);
    const attr = body.line.geometry.attributes.position;
    attr.setXYZ(0, 0, 0, 0);
    attr.setXYZ(1, position.x, position.y, position.z);
    attr.needsUpdate = true;
  });
  orbit.renderer.render(orbit.scene, orbit.camera);
}

function drawAnnealing() {
  stepAnnealing();
  const canvas = elements.annealingCanvas;
  const ctx = resetCanvas(canvas, true);
  const square = anneal.square;
  const analysis = lineEnergy(square);
  const bounds = squareBounds(canvas, square.length, 0.52);
  drawSquareField(ctx, square, analysis, bounds);
  if (anneal.lastSwap) drawSwapArc(ctx, bounds, square.length, anneal.lastSwap.a, anneal.lastSwap.b, anneal.lastSwap.accepted);
  drawEnergyChart(ctx, anneal.energyHistory, canvas.width * 0.56, 76, canvas.width * 0.38, canvas.height - 160);
  drawEnergyBadge(ctx, analysis, `accepted ${anneal.accepted}/${anneal.attempted}, best ${formatEnergy(anneal.bestEnergy)}`);
}

function stepAnnealing() {
  if (state.activeTab !== "annealing" || !anneal.square) return;
  const steps = Number(elements.swapsPerFrame.value);
  for (let step = 0; step < steps; step += 1) {
    const n = anneal.square.length;
    const total = n * n;
    const a = Math.floor(Math.random() * total);
    let b = Math.floor(Math.random() * total);
    if (a === b) b = (b + 1) % total;
    const before = lineEnergy(anneal.square).completeEnergy;
    const candidate = swapped(anneal.square, a, b);
    const after = lineEnergy(candidate).completeEnergy;
    const delta = after - before;
    const temp = Math.max(0.0001, Number(elements.temperature.value));
    const accepted = delta <= 0 || Math.exp(-delta / temp) > Math.random();
    anneal.attempted += 1;
    if (accepted) {
      anneal.square = candidate;
      anneal.accepted += 1;
      anneal.bestEnergy = Math.min(anneal.bestEnergy, after);
    }
    anneal.lastSwap = { a, b, accepted };
  }
  elements.temperature.value = Math.max(0.01, Number(elements.temperature.value) * Number(elements.cooling.value));
  anneal.energyHistory.push(lineEnergy(anneal.square).completeEnergy);
  if (anneal.energyHistory.length > 180) anneal.energyHistory.shift();
}

function drawLandscape(square) {
  const canvas = elements.landscapeCanvas;
  const ctx = resetCanvas(canvas, true);
  const n = square.length;
  const count = Number(elements.landscapeSamples.value);
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const sample = i % 2 === 0 ? randomOneSwap(square) : randomWalk(square, 1 + (i % 5));
    const analysis = lineEnergy(sample);
    points.push({
      x: analysis.lowModeEnergy,
      y: analysis.highModeEnergy,
      e: analysis.completeEnergy,
    });
  }
  const selected = lineEnergy(square);
  points.push({ x: selected.lowModeEnergy, y: selected.highModeEnergy, e: selected.completeEnergy, selected: true });
  drawScatter(ctx, points, canvas);
  drawEnergyBadge(ctx, selected, `landscape samples ${count}, n=${n}`);
}

function renderStats() {
  const statsSquare =
    state.activeTab === "annealing" && anneal.square
      ? anneal.square
      : state.activeTab === "bubbles" && bubbles.inducedSquare
        ? bubbles.inducedSquare
        : currentSquare();
  const analysis = lineEnergy(statsSquare);
  elements.stats.innerHTML = [
    ["Magic?", isMagic(statsSquare) ? "yes" : "no"],
    ["Complete energy", formatEnergy(analysis.completeEnergy)],
    ["Low-mode energy", formatEnergy(analysis.lowModeEnergy)],
    ["Max residual", formatNumber(analysis.maxResidual)],
    ["Temperature", Number(elements.temperature.value).toFixed(3)],
  ]
    .map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function drawSquareField(ctx, square, analysis, bounds) {
  const n = square.length;
  const cell = bounds.size / n;
  const maxZ = n * n - 1;
  const maxResidual = Math.max(1, analysis.maxResidual);
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const value = square[row][col];
      const z = centeredHeight(value, n);
      ctx.fillStyle = signedColor(z / maxZ, 0.42);
      ctx.fillRect(bounds.left + col * cell, bounds.top + row * cell, cell, cell);
      ctx.strokeStyle = "#303b40";
      ctx.strokeRect(bounds.left + col * cell, bounds.top + row * cell, cell, cell);
      ctx.fillStyle = "#eef1ea";
      ctx.font = `${Math.max(10, Math.min(20, cell * 0.28))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), bounds.left + (col + 0.5) * cell, bounds.top + (row + 0.5) * cell);
    }
  }
  ctx.globalCompositeOperation = "screen";
  analysis.rows.forEach((value, row) => {
    ctx.fillStyle = signedColor(value / maxResidual, 0.28);
    ctx.fillRect(bounds.left, bounds.top + row * cell, bounds.size, cell);
  });
  analysis.cols.forEach((value, col) => {
    ctx.fillStyle = signedColor(value / maxResidual, 0.28);
    ctx.fillRect(bounds.left + col * cell, bounds.top, cell, bounds.size);
  });
  ctx.globalCompositeOperation = "source-over";
}

function continuousField(x, y, analysis, bounds) {
  const n = analysis.rows.length;
  const cell = bounds.size / n;
  const localX = (x - bounds.left) / cell;
  const localY = (y - bounds.top) / cell;
  let fx = 0;
  let fy = 0;
  analysis.cols.forEach((value, col) => {
    const dx = localX - (col + 0.5);
    fx += (value * dx) / (0.45 + dx * dx);
  });
  analysis.rows.forEach((value, row) => {
    const dy = localY - (row + 0.5);
    fy += (value * dy) / (0.45 + dy * dy);
  });
  const dMain = localY - localX;
  const dAnti = localY + localX - (n - 1);
  fx += analysis.diags[0] * dMain * -0.16 + analysis.diags[1] * dAnti * 0.16;
  fy += analysis.diags[0] * dMain * 0.16 + analysis.diags[1] * dAnti * 0.16;
  return { x: fx || 0.001, y: fy || 0.001 };
}

function lowModeEnergy(square) {
  const n = square.length;
  let xz = 0;
  let yz = 0;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const z = centeredHeight(square[row][col], n);
      xz += latticeCoordinate(col, n) * z;
      yz += -latticeCoordinate(row, n) * z;
    }
  }
  return xz * xz + yz * yz;
}

function highModeEnergy(vector) {
  const modes = dctModes(vector);
  return sum(modes.slice(1).map((mode) => mode * mode));
}

function dctModes(vector) {
  const n = vector.length;
  return Array.from({ length: n }, (_, mode) => {
    const basis = Array.from({ length: n }, (_, i) => Math.cos((Math.PI * mode * (i + 0.5)) / n));
    const norm = Math.sqrt(sum(basis.map((value) => value * value))) || 1;
    return sum(vector.map((value, index) => (value * basis[index]) / norm));
  });
}

function swapped(square, a, b) {
  const n = square.length;
  const copy = cloneSquare(square);
  const ar = Math.floor(a / n);
  const ac = a % n;
  const br = Math.floor(b / n);
  const bc = b % n;
  [copy[ar][ac], copy[br][bc]] = [copy[br][bc], copy[ar][ac]];
  return copy;
}

function randomOneSwap(square) {
  const total = square.length * square.length;
  const a = Math.floor(Math.random() * total);
  let b = Math.floor(Math.random() * total);
  if (a === b) b = (b + 1) % total;
  return swapped(square, a, b);
}

function randomWalk(square, steps) {
  let current = cloneSquare(square);
  for (let i = 0; i < steps; i += 1) current = randomOneSwap(current);
  return current;
}

function drawEnergyChart(ctx, history, x, y, w, h) {
  ctx.strokeStyle = "#303b40";
  ctx.strokeRect(x, y, w, h);
  if (history.length < 2) return;
  const max = Math.max(1, ...history);
  ctx.strokeStyle = "#d28a52";
  ctx.lineWidth = 2;
  ctx.beginPath();
  history.forEach((value, index) => {
    const px = x + (index / (history.length - 1)) * w;
    const py = y + h - (value / max) * h;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.fillStyle = "#a5aea9";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText("energy over accepted/proposed swaps", x, y + h + 22);
}

function drawSwapArc(ctx, bounds, n, a, b, accepted) {
  const cell = bounds.size / n;
  const ax = bounds.left + (a % n + 0.5) * cell;
  const ay = bounds.top + (Math.floor(a / n) + 0.5) * cell;
  const bx = bounds.left + (b % n + 0.5) * cell;
  const by = bounds.top + (Math.floor(b / n) + 0.5) * cell;
  ctx.strokeStyle = accepted ? "#90b96f" : "#c86958";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo((ax + bx) / 2, Math.min(ay, by) - 45, bx, by);
  ctx.stroke();
}

function drawScatter(ctx, points, canvas) {
  const pad = 54;
  const w = canvas.width - pad * 2;
  const h = canvas.height - 110;
  const left = pad;
  const top = 52;
  const maxX = Math.max(1, ...points.map((point) => point.x));
  const maxY = Math.max(1, ...points.map((point) => point.y));
  const maxE = Math.max(1, ...points.map((point) => point.e));
  ctx.strokeStyle = "#303b40";
  ctx.strokeRect(left, top, w, h);
  points.forEach((point) => {
    const x = left + (point.x / maxX) * w;
    const y = top + h - (point.y / maxY) * h;
    ctx.fillStyle = point.selected ? "#d28a52" : heatColor(point.e / maxE);
    ctx.beginPath();
    ctx.arc(x, y, point.selected ? 8 : 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#a5aea9";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText("low-mode energy", left + w / 2 - 45, top + h + 34);
  ctx.save();
  ctx.translate(18, top + h / 2 + 52);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("higher residual mode energy", 0, 0);
  ctx.restore();
}

function seedFilings(count) {
  filings.particles = Array.from({ length: count }, () => ({ x: 0, y: 0, angle: Math.random() * Math.PI * 2 }));
  const bounds = squareBounds(elements.filingsCanvas, state.order);
  filings.particles.forEach((particle) => resetParticle(particle, bounds));
}

function resetParticle(particle, bounds) {
  particle.x = bounds.left + Math.random() * bounds.size;
  particle.y = bounds.top + Math.random() * bounds.size;
  particle.angle = Math.random() * Math.PI * 2;
}

function inside(point, bounds) {
  return point.x >= bounds.left && point.x <= bounds.left + bounds.size && point.y >= bounds.top && point.y <= bounds.top + bounds.size;
}

function squareBounds(canvas, n, widthFraction = 0.78) {
  const size = Math.min(canvas.height - 86, canvas.width * widthFraction);
  return {
    size,
    left: 46,
    top: (canvas.height - size) / 2 + 12,
    n,
  };
}

function resetCanvas(canvas, dark = false) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = dark ? "#07090a" : "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawEnergyBadge(ctx, analysis, label) {
  ctx.fillStyle = "rgba(23,28,31,0.86)";
  ctx.fillRect(18, 18, 330, 84);
  ctx.strokeStyle = "#303b40";
  ctx.strokeRect(18, 18, 330, 84);
  ctx.fillStyle = "#eef1ea";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText(`E = ${formatEnergy(analysis.completeEnergy)}`, 34, 48);
  ctx.fillStyle = "#a5aea9";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(`max |ρ| = ${formatNumber(analysis.maxResidual)}`, 34, 70);
  ctx.fillText(label, 34, 91);
}

function resizeOrbit() {
  if (!orbit.initialized) return;
  const rect = elements.orbitHost.getBoundingClientRect();
  orbit.renderer.setSize(rect.width, rect.height, false);
  orbit.camera.aspect = rect.width / rect.height;
  orbit.camera.updateProjectionMatrix();
}

function signedColor(value, alpha) {
  const color = value >= 0 ? [109, 170, 184] : [200, 105, 88];
  const t = Math.min(1, Math.abs(value));
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * (0.22 + 0.78 * t)})`;
}

function heatColor(value) {
  const t = Math.max(0, Math.min(1, value));
  const low = [47, 100, 112];
  const high = [210, 138, 82];
  const rgb = low.map((v, i) => Math.round(v + (high[i] - v) * Math.sqrt(t)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function interpolateAngle(a, b, t) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function formatEnergy(value) {
  if (value === 0) return "0";
  if (value > 999999) return value.toExponential(2);
  return value.toFixed(2);
}

function formatNumber(value) {
  return Math.abs(value) >= 1000 ? value.toLocaleString() : value.toFixed(0);
}
