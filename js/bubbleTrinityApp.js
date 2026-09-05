import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  centeredHeight,
  cloneSquare,
  isMagic,
  latticeCoordinate,
} from "./math.js";
import { classOptions, recordsFor } from "./squareData.js";

// Each regime baselines the full physics state in `base` and then exposes
// 1–4 knobs that override the parameters that actually matter for that
// regime. Parameters not listed in `knobs` stay at their baseline.
//
// Physics parameters glossary:
//   field        – line-energy gradient strength (rows / cols / diags push).
//   repulsion    – bubble-bubble pressure (1/r^2).
//   well         – per-cell snap-to-source-lattice spring.
//   containment  – soft inward force counter-balancing repulsion. Acts as an
//                  isotropic spring toward the board center plus a soft wall
//                  at the boundary, so a "free" gas finds a finite radius
//                  equilibrium instead of sticking to the edges.
//   memory       – velocity persistence (1 = inertial, 0 = overdamped).
//   heightScale  – Z exaggeration on the shell pane.
//   snap         – centrifugal balance / stratification strength. A
//                  continuous, charge-aware force that pushes bubbles whose
//                  charge agrees in sign with a line's residual OUT of that
//                  line, and pulls bubbles whose charge opposes it IN —
//                  rotating / sorting the cloud toward zero residual the
//                  way a spinning bucket separates densities. No discrete
//                  teleporting; the cloud drifts toward balance smoothly.
//   temperature  – isotropic jitter scaled by snap. Lets the system hop out
//                  of frustrated configurations without snapping
//                  discontinuously.
//   occupancy    – "one bubble per cell" pressure. Each tick we identify
//                  cells with multiple bubbles, score every bubble's fit
//                  for every cell using a combined 2D + 3D shell distance
//                  + line-residual fit, and apply a directed nudge on the
//                  worst-fit bubble in each crowded cell toward its best
//                  free target. Continuous force, not a teleport.
const VARIATIONS = [
  {
    id: "frozen",
    eyebrow: "Variation I",
    title: "Frozen lattice",
    caption:
      "Wells dominate; bubbles snap to source cells. Each shell glows steadily where its vector terminal lives, giving a static (X, Y, Z) skeleton.",
    base: {
      field: 0.0,
      repulsion: 0.0,
      well: 7.0,
      containment: 0.0,
      memory: 0.94,
      heightScale: 0.16,
      snap: 0.0,
      temperature: 0.0,
      occupancy: 0.0,
    },
    knobs: [
      { key: "well", label: "Lock strength", min: 2, max: 10, step: 0.1, default: 7.0 },
      { key: "heightScale", label: "Vertical exaggeration", min: 0.05, max: 0.32, step: 0.005, default: 0.16 },
      { key: "snap", label: "Snap rate", min: 0, max: 1, step: 0.02, default: 0.0 },
    ],
  },
  {
    id: "drift",
    eyebrow: "Variation II",
    title: "Slow drift",
    caption:
      "Wells still hold the lattice, but a gentle field nudges bubbles. The neon hot-patches wander slowly across each shell's surface.",
    base: {
      field: 1.0,
      repulsion: 0.4,
      well: 2.6,
      containment: 0.0,
      memory: 0.82,
      heightScale: 0.18,
      snap: 0.0,
      temperature: 0.5,
      occupancy: 0.4,
    },
    knobs: [
      { key: "field", label: "Field nudge", min: 0, max: 2.5, step: 0.05, default: 1.0 },
      { key: "well", label: "Lattice well", min: 0.6, max: 6.0, step: 0.05, default: 2.6 },
      { key: "memory", label: "Flow memory", min: 0.2, max: 0.95, step: 0.01, default: 0.82 },
      { key: "snap", label: "Snap rate", min: 0, max: 1, step: 0.02, default: 0.0 },
    ],
  },
  {
    id: "storm",
    eyebrow: "Variation III",
    title: "Field storm",
    caption:
      "Field overpowers wells. Bubbles flow around line residuals; shells expand and contract with their terminals, hot-patches sweeping across them.",
    base: {
      field: 3.2,
      repulsion: 1.0,
      well: 0.8,
      containment: 0.4,
      memory: 0.6,
      heightScale: 0.2,
      snap: 0.0,
      temperature: 1.0,
      occupancy: 0.6,
    },
    knobs: [
      { key: "field", label: "Storm intensity", min: 0.8, max: 5.0, step: 0.05, default: 3.2 },
      { key: "memory", label: "Flow memory", min: 0.2, max: 0.95, step: 0.01, default: 0.6 },
      { key: "containment", label: "Containment", min: 0, max: 3.0, step: 0.05, default: 0.4 },
      { key: "occupancy", label: "Occupancy", min: 0, max: 2.0, step: 0.05, default: 0.6 },
    ],
  },
  {
    id: "gas",
    eyebrow: "Variation IV",
    title: "Free gas",
    caption:
      "No wells: bubbles only see line residuals, each other, and a soft containment basin. Pressure pushes outward, containment pushes back inward, so the cloud finds a finite-radius equilibrium. Occupancy enforces one-bubble-per-cell — when two bubbles crowd the same cell the worse-fitting one is nudged toward its best free target (scored by 2D + 3D shell distance and line-residual fit). Snap rate adds a continuous centrifugal balance. Temperature adds a small jitter so frustrated arrangements can unstick.",
    base: {
      field: 1.4,
      repulsion: 4.0,
      well: 0.0,
      containment: 1.6,
      memory: 0.7,
      heightScale: 0.18,
      snap: 0.35,
      temperature: 1.2,
      occupancy: 1.0,
    },
    knobs: [
      { key: "repulsion", label: "Pressure", min: 0.5, max: 8.0, step: 0.05, default: 4.0 },
      { key: "containment", label: "Containment", min: 0.0, max: 4.5, step: 0.05, default: 1.6 },
      { key: "occupancy", label: "Occupancy", min: 0.0, max: 3.0, step: 0.05, default: 1.0 },
      { key: "snap", label: "Snap rate", min: 0, max: 1, step: 0.02, default: 0.35 },
      { key: "field", label: "Field bias", min: 0, max: 3.5, step: 0.05, default: 1.4 },
      { key: "temperature", label: "Temperature", min: 0.0, max: 4.0, step: 0.05, default: 1.2 },
    ],
  },
];

// Cap the visible knob count so the regime header stays readable. Extra
// knobs beyond this are still applied from the regime's `base`; expose the
// most interesting ones first.
const MAX_VISIBLE_KNOBS = 6;

const elements = {
  orderSelect: document.querySelector("#orderSelect"),
  classSelect: document.querySelector("#classSelect"),
  sampleSlider: document.querySelector("#sampleSlider"),
  sampleLabel: document.querySelector("#sampleLabel"),
  swapSlider: document.querySelector("#swapSlider"),
  swapLabel: document.querySelector("#swapLabel"),
  resetRunButton: document.querySelector("#resetRunButton"),
  resetParamsButton: document.querySelector("#resetParamsButton"),
  pauseButton: document.querySelector("#pauseButton"),
  settleButton: document.querySelector("#settleButton"),
  regimeBar: document.querySelector("#regimeBar"),
  regimeEyebrow: document.querySelector("#regimeEyebrow"),
  regimeTitle: document.querySelector("#regimeTitle"),
  regimeCaption: document.querySelector("#regimeCaption"),
  heroControls: document.querySelector("#heroControls"),
  bubbleCanvas: document.querySelector("#bubbleCanvas"),
  sphereHost: document.querySelector("#sphereHost"),
  heroStats: document.querySelector("#heroStats"),
  batchCountInput: document.querySelector("#batchCountInput"),
  runBatchButton: document.querySelector("#runBatchButton"),
  clearBatchButton: document.querySelector("#clearBatchButton"),
  batchStatus: document.querySelector("#batchStatus"),
  batchHistogram: document.querySelector("#batchHistogram"),
  batchTable: document.querySelector("#batchTable"),
  sessionHistogram: document.querySelector("#sessionHistogram"),
  sessionTrace: document.querySelector("#sessionTrace"),
  sessionStatus: document.querySelector("#sessionStatus"),
  resetSessionButton: document.querySelector("#resetSessionButton"),
};

// Batch state lives in-memory only. Resets when the page reloads.
const batchState = {
  results: [],
  activeIndex: -1,
};

// Session-wide settle log. Every Settle event (single Settle, batch trials,
// and replays-that-include-a-settle) appends here. Persists for the page
// session only — clear with the Reset session button. The cumulative
// histogram + temporal trace render off this list, giving us a true
// distribution of the basins reached during a working session.
const sessionState = {
  settles: [],
};

// Per-regime live knob handles, rebuilt on every applyRegime() call.
const knobBindings = [];

const globalState = {
  order: 4,
  kind: "magic",
  sample: 0,
  swapCount: 0,
  paused: false,
  regimeIndex: 0,
};

// Single live visualization. Regime switching just rewires the parameters
// and reseeds the bubble flow on the same scene.
const visualization = {
  config: VARIATIONS[0],
  params: { ...VARIATIONS[0].base },
  bubbles: [],
  square: null,
  inducedSquare: null,
  analysis: null,
  sphere: null,
};

installGlobalListeners();
refreshClassOptions();
buildRegimeBar();
initSphereScene(visualization);
applyRegime(0, { resetParams: true });
syncSourceSquare();
requestAnimationFrame(loop);
window.addEventListener("resize", () => {
  resizeVariation(visualization);
  renderSessionTrace();
});

function installGlobalListeners() {
  elements.orderSelect.addEventListener("change", () => {
    globalState.order = Number(elements.orderSelect.value);
    globalState.sample = 0;
    refreshClassOptions();
    syncSourceSquare();
  });
  elements.classSelect.addEventListener("change", () => {
    globalState.kind = elements.classSelect.value;
    globalState.sample = 0;
    syncSourceSquare();
  });
  elements.sampleSlider.addEventListener("input", () => {
    globalState.sample = Number(elements.sampleSlider.value);
    syncSourceSquare();
  });
  elements.swapSlider.addEventListener("input", () => {
    globalState.swapCount = Number(elements.swapSlider.value);
    elements.swapLabel.textContent = String(globalState.swapCount);
    if (globalState.kind.startsWith("swap")) syncSourceSquare();
  });
  elements.resetRunButton.addEventListener("click", () => {
    seedBubbles(visualization);
  });
  elements.resetParamsButton.addEventListener("click", () => {
    applyRegime(globalState.regimeIndex, { resetParams: true });
  });
  elements.pauseButton.addEventListener("click", () => {
    globalState.paused = !globalState.paused;
    elements.pauseButton.textContent = globalState.paused ? "Resume" : "Pause";
  });
  elements.settleButton.addEventListener("click", () => {
    settleBubbles(visualization);
  });
  elements.runBatchButton.addEventListener("click", () => {
    const count = clampBatchCount(elements.batchCountInput.value);
    elements.batchCountInput.value = String(count);
    runBatchAndRender(count);
  });
  elements.clearBatchButton.addEventListener("click", () => {
    batchState.results = [];
    batchState.activeIndex = -1;
    renderBatchHistogram();
    renderBatchTable();
    elements.batchStatus.textContent = "";
  });
  elements.resetSessionButton.addEventListener("click", () => {
    sessionState.settles = [];
    renderSessionHistogram();
    renderSessionTrace();
    elements.sessionStatus.textContent = "";
  });
  renderBatchHistogram();
  renderBatchTable();
  renderSessionHistogram();
  renderSessionTrace();
}

function clampBatchCount(raw) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(500, value));
}

function runBatchAndRender(count) {
  // Disable UI during the batch so big counts don't get queued up.
  elements.runBatchButton.disabled = true;
  elements.batchStatus.textContent = `Running ${count} trials…`;
  // Yield to the event loop so the disabled state and status text actually
  // render before we kick off the synchronous SA loop.
  setTimeout(() => {
    const startedAt = performance.now();
    const results = runSettleBatch(visualization, count);
    const elapsed = performance.now() - startedAt;
    batchState.results = results;
    batchState.activeIndex = -1;
    renderBatchHistogram();
    renderBatchTable();
    const magicCount = results.filter((r) => r.magic).length;
    const minE = results.reduce((acc, r) => Math.min(acc, r.finalE), Infinity);
    elements.batchStatus.textContent = `${count} trials in ${(elapsed / 1000).toFixed(2)}s · best E = ${formatEnergy(minE)} · magic ${magicCount}/${count}`;
    elements.runBatchButton.disabled = false;
  }, 16);
}

function renderBatchHistogram() {
  const host = elements.batchHistogram;
  host.innerHTML = "";
  const results = batchState.results;
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "hist-empty";
    empty.textContent = "Run a batch to populate the basin distribution.";
    host.appendChild(empty);
    return;
  }
  const buckets = bucketEnergyDistribution(results);
  const maxCount = buckets.reduce((acc, b) => Math.max(acc, b.count), 0);
  const activeE = batchState.activeIndex >= 0
    ? results[batchState.activeIndex]?.finalE
    : null;
  for (const bucket of buckets) {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = "hist-bar";
    if (bucket.E === 0) bar.classList.add("is-magic");
    if (bucket.E === activeE) bar.classList.add("is-active");
    const heightPct = (bucket.count / maxCount) * 100;
    bar.innerHTML = `
      <span class="hist-count">${bucket.count}</span>
      <span class="hist-fill" style="height: ${heightPct}%"></span>
      <span class="hist-label">${formatEnergy(bucket.E)}</span>
    `;
    bar.addEventListener("click", () => {
      const firstHit = results.findIndex((r) => r.finalE === bucket.E);
      if (firstHit >= 0) replayBatchResult(firstHit);
    });
    host.appendChild(bar);
  }
}

function renderBatchTable() {
  const tbody = elements.batchTable.querySelector("tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < batchState.results.length; i += 1) {
    const r = batchState.results[i];
    const tr = document.createElement("tr");
    if (i === batchState.activeIndex) tr.classList.add("is-active");
    tr.innerHTML = `
      <td>${r.trial + 1}</td>
      <td>${formatEnergy(r.finalE)}</td>
      <td>${formatEnergy(r.rowsE)}</td>
      <td>${formatEnergy(r.colsE)}</td>
      <td>${formatEnergy(r.diagsE)}</td>
      <td class="${r.magic ? "magic-yes" : "magic-no"}">${r.magic ? "yes" : "no"}</td>
    `;
    tr.addEventListener("click", () => replayBatchResult(i));
    tbody.appendChild(tr);
  }
}

function replayBatchResult(index) {
  const r = batchState.results[index];
  if (!r || !visualization.square) return;
  const n = visualization.square.length;
  applySquareToBubbles(visualization, r.square, n);
  visualization.inducedSquare = inducedSquareFromBubbles(visualization, n);
  visualization.analysis = lineEnergy(visualization.inducedSquare);
  batchState.activeIndex = index;
  renderBatchHistogram();
  renderBatchTable();
  logSettleEvent({
    action: "replay",
    trial: r.trial,
    finalE: r.finalE,
  });
}

// Append a settle outcome to the session log and refresh the cumulative
// views. `source` lets us tag where the event came from so we can later
// filter (e.g. "only show batch trials, not single Settles"). Pass
// `defer: true` to skip the per-event re-render — the caller is expected
// to call refreshSessionViews() once the batch is done.
function recordSettleEvent({ initialE, finalE, source, defer = false }) {
  const event = {
    index: sessionState.settles.length,
    initialE,
    finalE,
    source,
    timestamp: Date.now(),
    n: visualization.square?.length ?? null,
    regime: visualization.config?.id ?? null,
    kind: globalState.kind,
    sample: globalState.sample,
    swapCount: globalState.swapCount,
  };
  sessionState.settles.push(event);
  if (!defer) refreshSessionViews();
}

function refreshSessionViews() {
  renderSessionHistogram();
  renderSessionTrace();
}

function renderSessionHistogram() {
  const host = elements.sessionHistogram;
  if (!host) return;
  host.innerHTML = "";
  const settles = sessionState.settles;
  if (!settles.length) {
    const empty = document.createElement("p");
    empty.className = "hist-empty";
    empty.textContent = "Click Settle or run a batch to start the session log.";
    host.appendChild(empty);
    updateSessionStatus();
    return;
  }
  const buckets = new Map();
  for (const e of settles) {
    buckets.set(e.finalE, (buckets.get(e.finalE) ?? 0) + 1);
  }
  const sorted = Array.from(buckets.entries())
    .map(([E, count]) => ({ E, count }))
    .sort((a, b) => a.E - b.E);
  const maxCount = sorted.reduce((acc, b) => Math.max(acc, b.count), 0);
  for (const bucket of sorted) {
    const bar = document.createElement("div");
    bar.className = "hist-bar";
    if (bucket.E === 0) bar.classList.add("is-magic");
    const heightPct = (bucket.count / maxCount) * 100;
    bar.innerHTML = `
      <span class="hist-count">${bucket.count}</span>
      <span class="hist-fill" style="height: ${heightPct}%"></span>
      <span class="hist-label">${formatEnergy(bucket.E)}</span>
    `;
    host.appendChild(bar);
  }
  updateSessionStatus();
}

function updateSessionStatus() {
  const settles = sessionState.settles;
  if (!settles.length) {
    elements.sessionStatus.textContent = "";
    return;
  }
  const finals = settles.map((e) => e.finalE);
  const total = settles.length;
  const minE = finals.reduce((a, b) => Math.min(a, b), Infinity);
  const meanE = finals.reduce((a, b) => a + b, 0) / total;
  const magicCount = finals.filter((e) => e === 0).length;
  // Recent-window mean to make basin-hopping descent visible at a glance.
  const tail = finals.slice(Math.max(0, finals.length - 10));
  const tailMean = tail.reduce((a, b) => a + b, 0) / tail.length;
  elements.sessionStatus.textContent =
    `${total} settles · best ${formatEnergy(minE)} · mean ${formatEnergy(meanE)} · last 10 mean ${formatEnergy(tailMean)} · magic ${magicCount}`;
}

function renderSessionTrace() {
  const canvas = elements.sessionTrace;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const widthPx = Math.max(320, Math.floor(rect.width || canvas.width));
  const heightPx = Math.max(160, Math.floor(rect.height || canvas.height));
  if (canvas.width !== widthPx * dpr || canvas.height !== heightPx * dpr) {
    canvas.width = widthPx * dpr;
    canvas.height = heightPx * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, widthPx, heightPx);

  // Background.
  ctx.fillStyle = "#171c1f";
  ctx.fillRect(0, 0, widthPx, heightPx);

  const settles = sessionState.settles;
  if (!settles.length) {
    ctx.fillStyle = "#a5aea9";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Trace appears once you have settle events.", widthPx / 2, heightPx / 2);
    return;
  }

  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 22;
  const plotW = widthPx - padLeft - padRight;
  const plotH = heightPx - padTop - padBottom;

  const finals = settles.map((e) => e.finalE);
  let maxE = finals.reduce((a, b) => Math.max(a, b), 0);
  if (maxE === 0) maxE = 1;
  const xOf = (i) =>
    padLeft + (finals.length === 1 ? plotW / 2 : (i / (finals.length - 1)) * plotW);
  const yOf = (E) => padTop + plotH - (E / maxE) * plotH;

  // Axes.
  ctx.strokeStyle = "#303b40";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, padTop + plotH);
  ctx.lineTo(padLeft + plotW, padTop + plotH);
  ctx.stroke();

  // Y-axis ticks at 0, max/2, max.
  ctx.fillStyle = "#a5aea9";
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const frac of [0, 0.5, 1]) {
    const value = maxE * (1 - frac);
    const y = padTop + plotH * frac;
    ctx.fillText(formatEnergy(value), padLeft - 6, y);
    ctx.strokeStyle = "#21282c";
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + plotW, y);
    ctx.stroke();
  }

  // Magic baseline (E = 0) emphasized.
  ctx.strokeStyle = "rgba(210, 138, 82, 0.45)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padLeft, yOf(0));
  ctx.lineTo(padLeft + plotW, yOf(0));
  ctx.stroke();
  ctx.setLineDash([]);

  // Running minimum line (best E achieved up to each index).
  let runningMin = Infinity;
  const minSeries = finals.map((e) => {
    runningMin = Math.min(runningMin, e);
    return runningMin;
  });
  ctx.strokeStyle = "rgba(144, 185, 111, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < minSeries.length; i += 1) {
    const x = xOf(i);
    const y = yOf(minSeries[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Trailing-window mean line (10-sample moving average).
  const windowSize = 10;
  const meanSeries = finals.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0;
    for (let j = start; j <= i; j += 1) sum += finals[j];
    return sum / (i - start + 1);
  });
  ctx.strokeStyle = "rgba(109, 170, 184, 0.85)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = 0; i < meanSeries.length; i += 1) {
    const x = xOf(i);
    const y = yOf(meanSeries[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Per-event dots so individual settles are visible without occluding the
  // moving lines.
  for (let i = 0; i < finals.length; i += 1) {
    const E = finals[i];
    const x = xOf(i);
    const y = yOf(E);
    ctx.fillStyle = E === 0 ? "#d28a52" : "rgba(238, 241, 234, 0.55)";
    ctx.beginPath();
    ctx.arc(x, y, E === 0 ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legend.
  ctx.font = "10px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const legendItems = [
    { label: "settles", color: "rgba(238, 241, 234, 0.7)" },
    { label: "best so far", color: "rgba(144, 185, 111, 0.9)" },
    { label: "10-mean", color: "rgba(109, 170, 184, 1)" },
    { label: "magic E=0", color: "#d28a52" },
  ];
  let cursor = padLeft;
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(cursor, padTop + plotH + 6, 8, 8);
    ctx.fillStyle = "#a5aea9";
    ctx.fillText(item.label, cursor + 12, padTop + plotH + 6);
    cursor += 12 + ctx.measureText(item.label).width + 14;
  }
}

function buildRegimeBar() {
  elements.regimeBar.innerHTML = "";
  VARIATIONS.forEach((config, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "regime-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", index === globalState.regimeIndex ? "true" : "false");
    button.dataset.index = String(index);
    button.innerHTML = `
      <span class="tab-eyebrow">${config.eyebrow}</span>
      <span class="tab-title">${config.title}</span>
      <span class="tab-summary">${shortSummary(config)}</span>
    `;
    button.addEventListener("click", () => {
      applyRegime(index, { resetParams: false });
    });
    elements.regimeBar.appendChild(button);
  });
}

function shortSummary(config) {
  const visible = (config.knobs ?? []).slice(0, 3).map((k) => k.label);
  return visible.join(" · ");
}

function applyRegime(index, { resetParams }) {
  globalState.regimeIndex = index;
  const config = VARIATIONS[index];
  visualization.config = config;
  // Always rebase from the regime's `base` so stale parameters from a
  // previous regime can't leak in (e.g. a "well" value from Frozen leaking
  // into Free gas).
  visualization.params = { ...config.base };

  buildKnobs(config);

  // Update header copy + tab selection.
  elements.regimeEyebrow.textContent = config.eyebrow;
  elements.regimeTitle.textContent = config.title;
  elements.regimeCaption.textContent = config.caption;
  for (const tab of elements.regimeBar.querySelectorAll(".regime-tab")) {
    tab.setAttribute("aria-selected", Number(tab.dataset.index) === index ? "true" : "false");
  }

  // Reseed the bubbles so the new regime starts from a clean lattice.
  seedBubbles(visualization);
  void resetParams;
}

function buildKnobs(config) {
  const knobs = (config.knobs ?? []).slice(0, MAX_VISIBLE_KNOBS);
  knobBindings.length = 0;
  elements.heroControls.innerHTML = "";
  elements.heroControls.classList.remove(
    "knobs-1",
    "knobs-2",
    "knobs-3",
    "knobs-4",
    "knobs-5",
    "knobs-6",
  );
  elements.heroControls.classList.add(`knobs-${Math.max(1, knobs.length)}`);
  for (const spec of knobs) {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = spec.label;
    span.dataset.value = formatKnob(spec.default);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.default);
    label.appendChild(span);
    label.appendChild(input);
    elements.heroControls.appendChild(label);
    visualization.params[spec.key] = spec.default;
    const binding = { spec, input, span };
    knobBindings.push(binding);
    input.addEventListener("input", () => {
      const value = Number(input.value);
      visualization.params[spec.key] = value;
      span.dataset.value = formatKnob(value);
    });
  }
}

function refreshClassOptions() {
  const options = classOptions(globalState.order);
  elements.classSelect.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  if (!options.some((option) => option.value === globalState.kind))
    globalState.kind = "magic";
  elements.classSelect.value = globalState.kind;
}

function currentSquare() {
  const records = recordsFor(
    globalState.order,
    globalState.kind,
    globalState.swapCount,
  );
  globalState.sample = Math.min(
    globalState.sample,
    Math.max(0, records.length - 1),
  );
  elements.sampleSlider.max = String(Math.max(0, records.length - 1));
  elements.sampleSlider.value = String(globalState.sample);
  elements.sampleLabel.textContent = `${globalState.sample + 1}/${records.length}`;
  elements.swapLabel.textContent = String(globalState.swapCount);
  return records[globalState.sample]?.square ?? null;
}

function formatKnob(value) {
  return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function initSphereScene(variation) {
  const host = elements.sphereHost;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070a);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  camera.position.set(8.5, 8.5, 11);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const light = new THREE.DirectionalLight(0xffffff, 1.1);
  light.position.set(8, 12, 10);
  scene.add(light);
  scene.add(new THREE.AxesHelper(3.6));
  scene.add(new THREE.GridHelper(8, 8, 0x29333a, 0x161d22));
  variation.sphere = {
    host,
    scene,
    camera,
    renderer,
    controls,
    bodies: [],
  };
}

function resizeVariation(variation) {
  const view = variation.sphere;
  if (!view) return;
  const rect = view.host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  view.renderer.setSize(rect.width, rect.height, false);
  view.camera.aspect = rect.width / rect.height;
  view.camera.updateProjectionMatrix();
}

function syncSourceSquare() {
  const square = currentSquare();
  visualization.square = square ? cloneSquare(square) : null;
  seedBubbles(visualization);
  resizeVariation(visualization);
  // Stale batch results reference the prior source's value set or layout
  // semantics; clear them so the histogram doesn't lie about the new
  // configuration's basin distribution.
  if (batchState.results.length) {
    batchState.results = [];
    batchState.activeIndex = -1;
    if (elements.batchStatus) elements.batchStatus.textContent = "";
    renderBatchHistogram();
    renderBatchTable();
  }
}

function seedBubbles(variation) {
  if (!variation.square) return;
  const n = variation.square.length;
  variation.bubbles = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const value = variation.square[row][col];
      variation.bubbles.push({
        value,
        charge: centeredHeight(value, n),
        x: col + 0.5 + (Math.random() - 0.5) * 0.05,
        y: row + 0.5 + (Math.random() - 0.5) * 0.05,
        vx: 0,
        vy: 0,
      });
    }
  }
  variation.inducedSquare = inducedSquareFromBubbles(variation, n);
  variation.analysis = lineEnergy(variation.inducedSquare);
  rebuildThreeBodies(variation);
}

// Discrete simulated-annealing settle. Continuous gradient descent gets
// stuck because magic-square escape moves are *cyclic* permutations of
// cells, not single-bubble drifts — for n=3 in particular, the magic basin
// is reached through coordinated 3-cycles. This function works directly on
// cell assignments: it permutes which bubble lives in which cell, scores
// each candidate permutation via the induced-square line-energy, and
// accepts via Metropolis. We propose a mix of 2-cycles (swap two bubbles)
// and 3-cycles (rotate three bubbles around a triangle) so frustrated 2D
// configurations can escape barriers that 2-cycles alone can't cross.
function settleBubbles(variation) {
  if (!variation.bubbles.length || !variation.square) return;
  const n = variation.square.length;
  const bubbles = variation.bubbles;
  if (bubbles.length < 2) return;

  // Snap each bubble to its current nearest-cell assignment so the discrete
  // search starts from a consistent integer configuration.
  const startSquare = inducedSquareFromBubbles(variation, n);
  for (const b of bubbles) {
    b.vx = 0;
    b.vy = 0;
  }

  const initialE = lineEnergy(startSquare).completeEnergy;
  const result = runSimulatedAnneal(startSquare, n, {
    iterations: 1500,
    startTemperature: Math.max(50, initialE * 0.4),
  });

  applySquareToBubbles(variation, result.bestSquare, n);
  variation.inducedSquare = inducedSquareFromBubbles(variation, n);
  variation.analysis = lineEnergy(variation.inducedSquare);
  logSettleEvent({
    action: "settle",
    initialE,
    finalE: result.bestE,
    iterations: 1500,
  });
  recordSettleEvent({
    initialE,
    finalE: result.bestE,
    source: "settle",
  });
}

// Pure-ish discrete simulated-annealing core. Operates on a square of
// integer values; returns the best-energy square found and its energy.
// Refactored out of settleBubbles so batch runs can invoke many trials
// without touching the live bubble state until they're ready to commit.
function runSimulatedAnneal(square, n, opts = {}) {
  const iterations = opts.iterations ?? 1500;
  const startT = opts.startTemperature ?? 60;
  const endT = opts.endTemperature ?? 0.01;
  const grid = Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => centeredHeight(square[row][col], n)),
  );
  // Parallel grid of original values so we can return a value-square at
  // the end without having to invert centeredHeight.
  const valueGrid = Array.from({ length: n }, (_, row) => square[row].slice());

  const energyOf = (g) => {
    let E = 0;
    let dMain = 0;
    let dAnti = 0;
    for (let r = 0; r < n; r += 1) {
      let rowSum = 0;
      let colSum = 0;
      for (let c = 0; c < n; c += 1) {
        rowSum += g[r][c];
        colSum += g[c][r];
      }
      E += rowSum * rowSum + colSum * colSum;
      dMain += g[r][r];
      dAnti += g[r][n - 1 - r];
    }
    E += dMain * dMain + dAnti * dAnti;
    return E;
  };

  let currentE = energyOf(grid);
  const bestGrid = grid.map((row) => row.slice());
  const bestValueGrid = valueGrid.map((row) => row.slice());
  let bestE = currentE;
  const cooling = Math.pow(endT / startT, 1 / iterations);
  let T = startT;

  const allCells = [];
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) allCells.push([r, c]);
  }
  const pick = () => allCells[Math.floor(Math.random() * allCells.length)];

  for (let iter = 0; iter < iterations; iter += 1) {
    const useTriple = Math.random() < 0.4 && allCells.length >= 3;
    let revert;
    if (useTriple) {
      const [r1, c1] = pick();
      let p2 = pick();
      while (p2[0] === r1 && p2[1] === c1) p2 = pick();
      let p3 = pick();
      while ((p3[0] === r1 && p3[1] === c1) || (p3[0] === p2[0] && p3[1] === p2[1])) p3 = pick();
      const [r2, c2] = p2;
      const [r3, c3] = p3;
      const a = grid[r1][c1], b = grid[r2][c2], c = grid[r3][c3];
      const av = valueGrid[r1][c1], bv = valueGrid[r2][c2], cv = valueGrid[r3][c3];
      grid[r1][c1] = c; grid[r2][c2] = a; grid[r3][c3] = b;
      valueGrid[r1][c1] = cv; valueGrid[r2][c2] = av; valueGrid[r3][c3] = bv;
      revert = () => {
        grid[r1][c1] = a; grid[r2][c2] = b; grid[r3][c3] = c;
        valueGrid[r1][c1] = av; valueGrid[r2][c2] = bv; valueGrid[r3][c3] = cv;
      };
    } else {
      const [r1, c1] = pick();
      let p2 = pick();
      while (p2[0] === r1 && p2[1] === c1) p2 = pick();
      const [r2, c2] = p2;
      const a = grid[r1][c1], b = grid[r2][c2];
      const av = valueGrid[r1][c1], bv = valueGrid[r2][c2];
      grid[r1][c1] = b; grid[r2][c2] = a;
      valueGrid[r1][c1] = bv; valueGrid[r2][c2] = av;
      revert = () => {
        grid[r1][c1] = a; grid[r2][c2] = b;
        valueGrid[r1][c1] = av; valueGrid[r2][c2] = bv;
      };
    }

    const trialE = energyOf(grid);
    const dE = trialE - currentE;
    const accept = dE <= 0 || Math.random() < Math.exp(-dE / Math.max(1e-6, T));
    if (accept) {
      currentE = trialE;
      if (currentE < bestE) {
        bestE = currentE;
        for (let r = 0; r < n; r += 1) {
          for (let c = 0; c < n; c += 1) {
            bestGrid[r][c] = grid[r][c];
            bestValueGrid[r][c] = valueGrid[r][c];
          }
        }
        if (bestE === 0) break;
      }
    } else {
      revert();
    }
    T *= cooling;
  }

  return { bestSquare: bestValueGrid, bestE };
}

// Apply a value-square to the variation's bubble list, repositioning each
// bubble to the cell its value occupies in the target square.
function applySquareToBubbles(variation, square, n) {
  const valueToBubble = new Map();
  for (const b of variation.bubbles) valueToBubble.set(b.value, b);
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      const b = valueToBubble.get(square[r][c]);
      if (b) {
        b.x = c + 0.5;
        b.y = r + 0.5;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }
}

// Random permutation of the values currently held by the bubbles, laid
// out as an n×n square. Used by the Settle batch runner so each trial
// starts from an independent random configuration rather than from where
// the last trial happened to land.
function randomPermutationSquare(values, n) {
  const shuffled = values.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  const square = [];
  for (let r = 0; r < n; r += 1) {
    square.push(shuffled.slice(r * n, (r + 1) * n));
  }
  return square;
}

// Run Settle from many random starts and capture the basin distribution.
// Each run is independent: we shuffle the source values into a fresh
// random permutation, anneal it, and record the (final E, square, line
// breakdown). The live bubble state is restored to its pre-batch layout
// after the batch completes; individual results stay in the panel and
// can be replayed by clicking them.
function runSettleBatch(variation, count) {
  if (!variation.bubbles.length || !variation.square) return [];
  const n = variation.square.length;
  const values = variation.bubbles.map((b) => b.value);
  const startedAt = performance.now();
  const results = [];
  for (let trial = 0; trial < count; trial += 1) {
    const startSquare = randomPermutationSquare(values, n);
    const initialE = lineEnergy(startSquare).completeEnergy;
    const sa = runSimulatedAnneal(startSquare, n, {
      iterations: 1500,
      startTemperature: Math.max(50, initialE * 0.4),
    });
    const finalAnalysis = lineEnergy(sa.bestSquare);
    const rowsE = sum(finalAnalysis.rows.map((v) => v * v));
    const colsE = sum(finalAnalysis.cols.map((v) => v * v));
    const diagsE = finalAnalysis.diags.reduce((acc, v) => acc + v * v, 0);
    results.push({
      trial,
      finalE: sa.bestE,
      rowsE,
      colsE,
      diagsE,
      magic: isMagic(sa.bestSquare),
      square: sa.bestSquare.map((row) => row.slice()),
      startSquare: startSquare.map((row) => row.slice()),
      initialE,
    });
    recordSettleEvent({
      initialE,
      finalE: sa.bestE,
      source: "batch",
      defer: true,
    });
  }
  refreshSessionViews();
  logSettleEvent({
    action: "batch",
    count,
    elapsedMs: performance.now() - startedAt,
    distribution: bucketEnergyDistribution(results),
  });
  return results;
}

function bucketEnergyDistribution(results) {
  const buckets = new Map();
  for (const r of results) {
    buckets.set(r.finalE, (buckets.get(r.finalE) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([E, count]) => ({ E, count }))
    .sort((a, b) => a.E - b.E);
}

// Silent telemetry. Records each Settle / batch / replay action so we can
// later analyze how the manual workflow plays out and decide what to
// automate. Persisted only in-memory; clear with `window.__settleLog = []`.
function logSettleEvent(event) {
  if (typeof window === "undefined") return;
  if (!window.__settleLog) window.__settleLog = [];
  window.__settleLog.push({
    t: Date.now(),
    n: visualization.square?.length ?? null,
    regime: visualization.config?.id ?? null,
    kind: globalState.kind,
    sample: globalState.sample,
    swapCount: globalState.swapCount,
    ...event,
  });
}

function rebuildThreeBodies(variation) {
  if (!variation.square) return;
  const view = variation.sphere;
  if (!view) return;
  for (const body of view.bodies) {
    view.scene.remove(
      ...[body.line, body.sphere, body.glow, body.shell, body.label].filter(Boolean),
    );
    body.shellMaterial?.dispose?.();
    body.glow?.material?.map?.dispose?.();
    body.glow?.material?.dispose?.();
  }
  view.bodies = [];
  for (const bubble of variation.bubbles) {
    const positive = bubble.charge >= 0;
    const colorHex = positive ? 0x6cf4ff : 0xff7a8a;
    const color = new THREE.Color(colorHex);

    const shellMaterial = makeNeonShellMaterial(color);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      shellMaterial,
    );
    shell.renderOrder = 1;
    view.scene.add(shell);

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(6), 3),
    );
    const line = new THREE.Line(
      lineGeom,
      new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.55,
      }),
    );
    const terminal = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    terminal.renderOrder = 4;

    const glow = new THREE.Sprite(makeGlowSpriteMaterial(colorHex));
    glow.scale.set(0.95, 0.95, 0.95);
    glow.renderOrder = 3;

    const label = makeLabel(String(bubble.value), colorHex);
    label.renderOrder = 5;
    view.scene.add(line, glow, terminal, label);
    view.bodies.push({
      value: bubble.value,
      line,
      sphere: terminal,
      glow,
      shell,
      shellMaterial,
      label,
    });
  }
}

function makeGlowSpriteMaterial(colorHex) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  const hex = `#${colorHex.toString(16).padStart(6, "0")}`;
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, hex);
  gradient.addColorStop(0.55, hexWithAlpha(hex, 0.35));
  gradient.addColorStop(1, hexWithAlpha(hex, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  return new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
}

function hexWithAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function makeNeonShellMaterial(color) {
  const uniforms = {
    uColor: { value: color.clone() },
    uHotDir: { value: new THREE.Vector3(0, 0, 1) },
    uHotIntensity: { value: 1.0 },
    // Geodesic angular sigma in radians. Smaller = tighter, sharper patch.
    uCoreSigma: { value: 0.07 },
    uHaloSigma: { value: 0.18 },
    // Floor alpha so the unlit shell is faintly visible (so two overlapping
    // shells read as two surfaces). Set to 0 for invisible-when-cold.
    uBaseAlpha: { value: 0.05 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    // Standard alpha blending so overlapping shells layer like translucent
    // surfaces rather than saturating to white.
    blending: THREE.NormalBlending,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec3 vNormalLocal;
      varying vec3 vViewNormal;
      void main() {
        vNormalLocal = normalize(position);
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHotDir;
      uniform float uHotIntensity;
      uniform float uCoreSigma;
      uniform float uHaloSigma;
      uniform float uBaseAlpha;
      varying vec3 vNormalLocal;
      varying vec3 vViewNormal;
      void main() {
        // Geodesic angle (in radians) between this fragment and the hot dir.
        float aligned = clamp(dot(normalize(vNormalLocal), normalize(uHotDir)), -1.0, 1.0);
        if (aligned <= 0.0) discard;
        float angle = acos(aligned);

        // Two stacked Gaussians: a tight bright core and a slightly wider halo
        // for the long, gentle roll-off. Gaussians give smooth localization
        // without hard edges.
        float core = exp(-(angle * angle) / (uCoreSigma * uCoreSigma));
        float halo = exp(-(angle * angle) / (uHaloSigma * uHaloSigma));

        // Subtle Fresnel just to keep the shell readable as a curved surface
        // where the patch isn't lit.
        float rim = pow(1.0 - max(vViewNormal.z, 0.0), 3.5) * 0.18;

        float lit = clamp(core * 1.4 + halo * 0.35, 0.0, 1.6);
        float a = uBaseAlpha + rim + lit * uHotIntensity;
        // Brighter, whiter color in the very center; pure neon hue elsewhere.
        vec3 rgb = mix(uColor, vec3(1.0), core * 0.65) * (0.45 + lit * 1.3 * uHotIntensity);
        gl_FragColor = vec4(rgb, clamp(a, 0.0, 0.95));
      }
    `,
  });
}

// Visual update cadence. Capping the physics + render to ~10 Hz keeps the
// induced cell assignment from flashing as bubbles cross cell boundaries
// dozens of times per second — at 10 Hz the eye reads each step as a
// distinct state transition rather than a strobe. Continuous-time forces
// integrate with a proportionally larger dt so the regimes still look the
// same in steady state.
const TARGET_HZ = 10;
const STEP_INTERVAL_MS = 1000 / TARGET_HZ;
const STEP_DT = TARGET_HZ > 0 ? 60 / TARGET_HZ : 1; // physics units per tick
let lastStepAt = 0;

function loop(timestampMs) {
  requestAnimationFrame(loop);
  const now = typeof timestampMs === "number" ? timestampMs : performance.now();
  if (now - lastStepAt < STEP_INTERVAL_MS) return;
  lastStepAt = now;
  if (!globalState.paused) stepBubbles(visualization);
  renderVariation(visualization);
}

function stepBubbles(variation) {
  if (!variation.bubbles.length || !variation.square) return;
  const n = variation.square.length;
  const params = variation.params;
  // Take several small sub-steps per visible tick so the dynamics match
  // what 60 Hz used to look like, just sampled at 10 Hz. Sub-stepping (vs
  // multiplying force by STEP_DT in one go) keeps the repulsion / wall
  // springs numerically stable.
  const subSteps = Math.max(1, Math.round(STEP_DT));
  // When snap is active the centrifugal force depends on the live row/col
  // residuals, so we refresh analysis between sub-steps to let the cloud
  // converge in one tick. Otherwise the analysis from the previous tick is
  // good enough and we save a per-frame O(n²) recompute.
  const refreshAnalysis = (params.snap ?? 0) > 0;
  for (let s = 0; s < subSteps; s += 1) {
    if (refreshAnalysis) {
      variation.inducedSquare = inducedSquareFromBubbles(variation, n);
      variation.analysis = lineEnergy(variation.inducedSquare);
    }
    integrateForcesOnce(variation, params, n);
  }

  variation.inducedSquare = inducedSquareFromBubbles(variation, n);
  variation.analysis = lineEnergy(variation.inducedSquare);
}

function integrateForcesOnce(variation, params, n) {
  const analysis = variation.analysis ?? lineEnergy(variation.square);
  const fieldStrength = (params.field ?? 0) * 0.00085;
  const repulsion = (params.repulsion ?? 0) * 0.004;
  const wellStrength = (params.well ?? 0) * 0.0025;
  const containment = (params.containment ?? 0) * 0.0025;
  const occupancyStrength = (params.occupancy ?? 0) * 0.04;
  const damping = 0.9 + (params.memory ?? 0.7) * 0.08;
  const center = n / 2;
  const wallSoft = 0.6;

  // Occupancy directives: per-bubble (fx, fy) nudges that push the worst-fit
  // bubble in each crowded cell toward its best free target. Computed up
  // front from the current snapshot so all bubbles in this sub-step see a
  // consistent set of directives. Bubbles not on the directive list get
  // {0, 0}.
  const occupancyDirectives = occupancyStrength > 0
    ? computeOccupancyDirectives(variation, n, analysis, params)
    : null;
  // Centrifugal snap: a continuous, charge-aware stratification force that
  // replaces the old teleport-style Metropolis swap. For each line (row /
  // col / diagonal) with residual ρ, we want bubbles whose charge agrees
  // in sign with ρ to migrate OUT of that line (along the perpendicular
  // axis) and bubbles whose charge opposes ρ to migrate IN. This rotates /
  // stratifies the cloud toward a balanced state continuously, the way a
  // spinning bucket separates densities. Snap rate sets the strength;
  // temperature adds a small isotropic jitter so the system can hop out
  // of frustrated configurations without snapping discontinuously.
  const snapStrength = (params.snap ?? 0) * 0.012;
  const tempJitter = (params.temperature ?? 0) * 0.005 * (params.snap ?? 0);
  // Gaussian half-width (in cells) for line membership — ~ one cell so a
  // bubble inside row r feels row r's residual strongly and its neighbors
  // weakly. Squared so we can divide once.
  const sigma2 = 0.6;

  for (const p of variation.bubbles) {
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

    if (wellStrength > 0) {
      fx += (col + 0.5 - p.x) * wellStrength;
      fy += (row + 0.5 - p.y) * wellStrength;
    }

    if (containment > 0) {
      // Quadratic centering well so the cloud has a finite mean radius.
      fx += (center - p.x) * containment;
      fy += (center - p.y) * containment;
      // Soft wall: stiff inward push that activates only near the boundary,
      // replacing the hard clamp. Distances are measured from each edge.
      const leftPen = wallSoft - p.x;
      if (leftPen > 0) fx += leftPen * leftPen * containment * 80;
      const rightPen = p.x - (n - wallSoft);
      if (rightPen > 0) fx -= rightPen * rightPen * containment * 80;
      const topPen = wallSoft - p.y;
      if (topPen > 0) fy += topPen * topPen * containment * 80;
      const botPen = p.y - (n - wallSoft);
      if (botPen > 0) fy -= botPen * botPen * containment * 80;
    }

    if (repulsion > 0) {
      for (const q of variation.bubbles) {
        if (p === q) continue;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const r2 = dx * dx + dy * dy + 0.025;
        const push = repulsion / (r2 * Math.sqrt(r2));
        fx += dx * push;
        fy += dy * push;
      }
    }

    if (snapStrength > 0) {
      // Continuous centrifugal-style stratification. Each row's residual ρ_r
      // exerts a perpendicular (y-axis) force on bubbles weighted by row
      // membership. Sign convention: a charge that AGREES with ρ_r (same
      // sign) is pushed AWAY from row r along y; a charge that OPPOSES ρ_r
      // is pulled TOWARD row r. Net effect: the row's signed sum drifts to
      // zero. Same construction along x for columns. Diagonals use the
      // same idea projected on the diagonal-perpendicular axis.
      analysis.rows.forEach((rho, index) => {
        const dy = p.y - (index + 0.5);
        const w = Math.exp(-(dy * dy) / sigma2);
        // Force pushes p along ±y depending on sign(charge) * sign(ρ).
        // Magnitude grows with |ρ| and membership weight w.
        fy += forceSign * rho * dy * w * snapStrength * 0.18;
      });
      analysis.cols.forEach((rho, index) => {
        const dx = p.x - (index + 0.5);
        const w = Math.exp(-(dx * dx) / sigma2);
        fx += forceSign * rho * dx * w * snapStrength * 0.18;
      });
      // Diagonals: project onto perpendicular axis. Main diag direction is
      // (1,1)/√2; signed distance from p to the main diag, measured in the
      // perpendicular direction (-1,+1)/√2, is (y - x)/√2. Pushing AWAY
      // (increasing |distMain|) means moving along sign(distMain)·(-1,+1).
      const distMain = (p.y - p.x) * 0.7071;
      const wMain = Math.exp(-(distMain * distMain) / sigma2);
      const sMain = forceSign * analysis.diags[0] * distMain * wMain * snapStrength * 0.12;
      fx -= sMain * 0.7071;
      fy += sMain * 0.7071;
      // Anti-diag direction (1,-1)/√2; perpendicular (+1,+1)/√2; signed
      // distance is (y + x - n)/√2.
      const distAnti = (p.y + p.x - n) * 0.7071;
      const wAnti = Math.exp(-(distAnti * distAnti) / sigma2);
      const sAnti = forceSign * analysis.diags[1] * distAnti * wAnti * snapStrength * 0.12;
      fx += sAnti * 0.7071;
      fy += sAnti * 0.7071;
    }

    if (occupancyDirectives) {
      const dir = occupancyDirectives.get(p);
      if (dir) {
        fx += dir.fx * occupancyStrength;
        fy += dir.fy * occupancyStrength;
      }
    }

    if (tempJitter > 0) {
      fx += (Math.random() - 0.5) * tempJitter;
      fy += (Math.random() - 0.5) * tempJitter;
    }

    p.vx = (p.vx + fx) * damping;
    p.vy = (p.vy + fy) * damping;
  }

  const guard = 0.02;
  for (const p of variation.bubbles) {
    p.x = Math.max(guard, Math.min(n - guard, p.x + p.vx));
    p.y = Math.max(guard, Math.min(n - guard, p.y + p.vy));
  }
}

// Build directed nudges that enforce ~one bubble per cell. For each cell
// with > 1 occupants, identify the "worst fit" bubble (the one whose charge
// is least helpful at that cell — large |charge| in a cell whose row and
// column have residuals of the same sign means this bubble is making things
// worse) and aim it at its best currently-free cell. "Best" combines:
//   – 2D grid distance (penalize long migrations),
//   – arc-distance on the bubble's own shell (the spherical-coords term:
//     bubbles with large |v| feel a longer arc and prefer small angular
//     moves),
//   – residual fit: a bubble of charge q "fits" a cell whose row residual
//     and column residual both have OPPOSITE sign to q, since placing it
//     there reduces |row residual| and |col residual|.
function computeOccupancyDirectives(variation, n, analysis, params) {
  const heightScale = params.heightScale ?? 0.18;
  const directives = new Map();
  const bubbles = variation.bubbles;
  if (bubbles.length === 0) return directives;

  // 1) Bin bubbles by cell.
  const occupants = new Map(); // cellKey -> bubble[]
  for (const p of bubbles) {
    const col = Math.max(0, Math.min(n - 1, Math.floor(p.x)));
    const row = Math.max(0, Math.min(n - 1, Math.floor(p.y)));
    const key = row * n + col;
    let list = occupants.get(key);
    if (!list) {
      list = [];
      occupants.set(key, list);
    }
    list.push({ bubble: p, row, col });
  }

  // 2) Free cells = cells with no occupants.
  const freeCells = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      if (!occupants.has(row * n + col)) freeCells.push({ row, col });
    }
  }

  // No conflicts → no directives. (Should be impossible long-term given
  // n² bubbles in n² cells, but during dynamics it's common.)
  if (freeCells.length === 0) return directives;

  // Helper: 3D shell-arc distance between two grid positions for a given
  // bubble. The bubble's shell radius is |v| ≈ √(x² + y² + z²). Both
  // current and candidate positions live on the same shell, so arc length
  // is r * angle.
  const shellArc = (p, fromX, fromY, toX, toY) => {
    const z = p.charge * heightScale;
    const ax = (fromX - n / 2) * 2;
    const ay = -(fromY - n / 2) * 2;
    const bx = (toX - n / 2) * 2;
    const by = -(toY - n / 2) * 2;
    const ra = Math.hypot(ax, ay, z);
    const rb = Math.hypot(bx, by, z);
    if (ra < 1e-6 || rb < 1e-6) return 0;
    const dot = (ax * bx + ay * by + z * z) / (ra * rb);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    return 0.5 * (ra + rb) * angle;
  };

  // Helper: fit penalty for placing bubble at (row, col). Lower is better.
  // Penalize charges that AGREE in sign with the row/col residuals there
  // (since adding them grows |residual|), reward charges that OPPOSE.
  const fitPenalty = (charge, row, col) => {
    const rowRho = analysis.rows[row];
    const colRho = analysis.cols[col];
    return charge * rowRho + charge * colRho;
  };

  // 3) Walk crowded cells. For each, pick the worst-fit occupant and aim it
  // at the free cell that minimizes (move cost + fit cost). Mark that free
  // cell as "claimed" so two crowded cells don't both target it.
  const claimed = new Set();
  for (const [, list] of occupants) {
    if (list.length < 2) continue;
    let worstIdx = 0;
    let worstScore = -Infinity;
    for (let i = 0; i < list.length; i += 1) {
      const { bubble, row, col } = list[i];
      const fit = fitPenalty(bubble.charge, row, col);
      // The worst fit is the one with the largest positive penalty (most
      // contributing to imbalance). Tiebreak by larger |charge| so big
      // mismatches move first.
      const score = fit + 0.001 * Math.abs(bubble.charge);
      if (score > worstScore) {
        worstScore = score;
        worstIdx = i;
      }
    }
    const evictee = list[worstIdx];
    const p = evictee.bubble;

    // 4) Score every free, unclaimed cell as a target.
    let bestTarget = null;
    let bestCost = Infinity;
    for (const cellPos of freeCells) {
      const cellKey = cellPos.row * n + cellPos.col;
      if (claimed.has(cellKey)) continue;
      const tx = cellPos.col + 0.5;
      const ty = cellPos.row + 0.5;
      const grid = Math.hypot(p.x - tx, p.y - ty);
      const arc = shellArc(p, p.x, p.y, tx, ty);
      const fit = fitPenalty(p.charge, cellPos.row, cellPos.col);
      // Combined cost: travel cost (grid + arc) plus fit cost. Fit is a
      // signed quantity; subtracting it rewards opposite-sign charges. We
      // scale fit modestly so geometry still dominates close ties.
      const cost = grid + 0.4 * arc + 0.06 * fit;
      if (cost < bestCost) {
        bestCost = cost;
        bestTarget = cellPos;
      }
    }
    if (!bestTarget) continue;
    claimed.add(bestTarget.row * n + bestTarget.col);

    const tx = bestTarget.col + 0.5;
    const ty = bestTarget.row + 0.5;
    // Unit-coefficient nudge toward the target (caller scales by
    // occupancyStrength). Linear in displacement so it's strongest when
    // far away and gracefully fades as the bubble arrives.
    directives.set(p, {
      fx: tx - p.x,
      fy: ty - p.y,
    });
  }

  return directives;
}

function renderVariation(variation) {
  drawBubblePane(variation);
  drawSpherePane(variation);
  renderRowStats(variation);
}

function drawBubblePane(variation) {
  const canvas = elements.bubbleCanvas;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#07090a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!variation.square) return;
  const n = variation.square.length;
  const square = variation.inducedSquare ?? variation.square;
  const analysis = variation.analysis ?? lineEnergy(square);
  const bounds = squareBounds(canvas, n);
  drawSquareField(ctx, square, analysis, bounds);
  const cell = bounds.size / n;
  const maxCharge = n * n - 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.left, bounds.top, bounds.size, bounds.size);
  ctx.clip();
  for (const p of variation.bubbles) {
    const x = bounds.left + p.x * cell;
    const y = bounds.top + p.y * cell;
    const radius = Math.max(6, cell * (0.13 + 0.11 * Math.abs(p.charge) / maxCharge));
    const positive = p.charge >= 0;
    const gradient = ctx.createRadialGradient(
      x - radius * 0.25,
      y - radius * 0.3,
      radius * 0.2,
      x,
      y,
      radius,
    );
    gradient.addColorStop(
      0,
      positive ? "rgba(160,220,230,0.95)" : "rgba(232,154,125,0.95)",
    );
    gradient.addColorStop(
      1,
      positive ? "rgba(109,170,184,0.38)" : "rgba(200,105,88,0.38)",
    );
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = positive
      ? "rgba(109,170,184,0.9)"
      : "rgba(200,105,88,0.9)";
    ctx.stroke();
    ctx.fillStyle = "#eef1ea";
    ctx.font = `${Math.max(10, radius * 0.7)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.value), x, y);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(23,28,31,0.78)";
  ctx.fillRect(10, 10, 170, 46);
  ctx.strokeStyle = "#303b40";
  ctx.strokeRect(10, 10, 170, 46);
  ctx.fillStyle = "#eef1ea";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`E = ${formatEnergy(analysis.completeEnergy)}`, 20, 30);
  ctx.fillStyle = "#a5aea9";
  ctx.font = "11px Inter, sans-serif";
  ctx.fillText(`max |ρ| = ${formatNumber(analysis.maxResidual)}`, 20, 47);
}

function drawSpherePane(variation) {
  const view = variation.sphere;
  if (!view || !variation.bubbles.length) return;
  resizeIfNeeded(view);
  const n = variation.square.length;
  const heightScale = variation.params.heightScale;
  for (const body of view.bodies) {
    const bubble = bubbleByValue(variation, body.value);
    if (!bubble) continue;
    const target = bubbleToWorld(bubble, n, heightScale);
    const radius = Math.max(0.4, target.length());
    if (body.shell) body.shell.scale.setScalar(radius);

    const dir = target.clone().normalize();
    if (!Number.isFinite(dir.x)) dir.set(0, 0, 1);
    body.shellMaterial.uniforms.uHotDir.value.copy(dir);

    body.sphere.position.copy(target);
    if (body.glow) body.glow.position.copy(target);
    body.line.geometry.attributes.position.setXYZ(0, 0, 0, 0);
    body.line.geometry.attributes.position.setXYZ(
      1,
      target.x,
      target.y,
      target.z,
    );
    body.line.geometry.attributes.position.needsUpdate = true;
    body.label.position.copy(target).multiplyScalar(1.12);
  }
  view.controls.update();
  view.renderer.render(view.scene, view.camera);
}

function bubbleByValue(variation, value) {
  return variation.bubbles.find((b) => b.value === value) ?? null;
}

function bubbleToWorld(bubble, n, heightScale) {
  const x = (bubble.x - n / 2) * 2;
  const y = -(bubble.y - n / 2) * 2;
  const z = bubble.charge * heightScale;
  return new THREE.Vector3(x, y, z);
}

function resizeIfNeeded(view) {
  const rect = view.host.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const canvas = view.renderer.domElement;
  const ratio = view.renderer.getPixelRatio();
  if (
    canvas.width !== Math.round(rect.width * ratio) ||
    canvas.height !== Math.round(rect.height * ratio)
  ) {
    view.renderer.setSize(rect.width, rect.height, false);
    view.camera.aspect = rect.width / rect.height;
    view.camera.updateProjectionMatrix();
  }
}

function renderRowStats(variation) {
  if (!variation.analysis) return;
  const a = variation.analysis;
  // Per-line energy contributions so the user can see which constraints
  // are still violated when E is small but nonzero. Row/col/diag bars are
  // signed (positive = warm, negative = cool) with magnitude proportional
  // to |ρ| relative to the largest residual on the board.
  const denom = Math.max(1, a.maxResidual);
  const rowsContribution = sum(a.rows.map((v) => v * v));
  const colsContribution = sum(a.cols.map((v) => v * v));
  const diagsContribution = a.diags[0] * a.diags[0] + a.diags[1] * a.diags[1];
  const stats = [
    ["Magic?", isMagic(variation.inducedSquare ?? variation.square) ? "yes" : "no"],
    ["E", formatEnergy(a.completeEnergy)],
    ["max |ρ|", formatNumber(a.maxResidual)],
    ["low-mode", formatEnergy(a.lowModeEnergy)],
    ["E rows", formatEnergy(rowsContribution)],
    ["E cols", formatEnergy(colsContribution)],
    ["E diags", formatEnergy(diagsContribution)],
  ];
  const scalarHTML = stats
    .map(
      ([label, value]) =>
        `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join("");
  const barRows = [
    ["rows ρ", a.rows],
    ["cols ρ", a.cols],
    ["diags ρ", a.diags],
  ];
  const barsHTML = barRows
    .map(([label, values]) => `
      <div class="residual-row">
        <span class="residual-label">${label}</span>
        <span class="residual-bars">${values.map((v) => residualBarHTML(v, denom)).join("")}</span>
      </div>
    `)
    .join("");
  elements.heroStats.innerHTML = scalarHTML + barsHTML;
}

function residualBarHTML(value, denom) {
  const ratio = Math.max(-1, Math.min(1, value / denom));
  const widthPct = Math.abs(ratio) * 50;
  const positive = ratio >= 0;
  const sideStyle = positive
    ? `left: 50%; width: ${widthPct}%;`
    : `right: 50%; width: ${widthPct}%;`;
  const colorClass = positive ? "pos" : "neg";
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `<span class="residual-bar" title="ρ = ${formatted}">
    <span class="residual-fill ${colorClass}" style="${sideStyle}"></span>
  </span>`;
}

function lineEnergy(square) {
  const n = square.length;
  const rows = Array.from({ length: n }, (_, row) =>
    sum(
      Array.from({ length: n }, (_, col) =>
        centeredHeight(square[row][col], n),
      ),
    ),
  );
  const cols = Array.from({ length: n }, (_, col) =>
    sum(
      Array.from({ length: n }, (_, row) =>
        centeredHeight(square[row][col], n),
      ),
    ),
  );
  const diags = [
    sum(Array.from({ length: n }, (_, i) => centeredHeight(square[i][i], n))),
    sum(
      Array.from({ length: n }, (_, i) =>
        centeredHeight(square[i][n - 1 - i], n),
      ),
    ),
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
  };
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

function inducedSquareFromBubbles(variation, n) {
  const assignments = [];
  for (let particleIndex = 0; particleIndex < variation.bubbles.length; particleIndex += 1) {
    const p = variation.bubbles[particleIndex];
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
    if (usedParticles.has(item.particleIndex) || usedCells.has(cellKey))
      continue;
    usedParticles.add(item.particleIndex);
    usedCells.add(cellKey);
    square[item.row][item.col] = variation.bubbles[item.particleIndex].value;
    if (usedParticles.size === n * n) break;
  }
  return square;
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
    }
  }
  ctx.globalCompositeOperation = "screen";
  analysis.rows.forEach((value, row) => {
    ctx.fillStyle = signedColor(value / maxResidual, 0.24);
    ctx.fillRect(bounds.left, bounds.top + row * cell, bounds.size, cell);
  });
  analysis.cols.forEach((value, col) => {
    ctx.fillStyle = signedColor(value / maxResidual, 0.24);
    ctx.fillRect(bounds.left + col * cell, bounds.top, cell, bounds.size);
  });
  ctx.globalCompositeOperation = "source-over";
}

function squareBounds(canvas, n) {
  const size = Math.min(canvas.width, canvas.height) - 32;
  return {
    size,
    left: (canvas.width - size) / 2,
    top: (canvas.height - size) / 2,
    n,
  };
}

function makeLabel(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(7, 9, 10, 0.75)";
  ctx.beginPath();
  ctx.arc(48, 48, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#edf0ea";
  ctx.font = "700 32px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 48, 50);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.42, 0.42, 0.42);
  return sprite;
}

function signedColor(value, alpha) {
  const color = value >= 0 ? [109, 170, 184] : [200, 105, 88];
  const t = Math.min(1, Math.abs(value));
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * (0.22 + 0.78 * t)})`;
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
