import {
  centeredHeight,
  cloneSquare,
  isMagic,
  latticeCoordinate,
  magicResiduals,
} from "./math.js";
import { buildRecord, randomSquare } from "./generators.js";
import { classOptions, recordsFor } from "./squareData.js";

const LOW_MODE_COUNTEREXAMPLE = buildRecord(
  [
    [9, 4, 12, 3],
    [16, 1, 14, 7],
    [10, 15, 11, 8],
    [2, 5, 6, 13],
  ],
  {
    id: "low-mode-counterexample",
    kind: "low-mode-balanced",
    family: "paper-counterexample",
    source: "4x4 arrangement with zero low-mode energy but nonzero row/column imbalance",
  },
);

const elements = {
  orderSelect: document.querySelector("#orderSelect"),
  classSelect: document.querySelector("#classSelect"),
  sampleSlider: document.querySelector("#sampleSlider"),
  sampleLabel: document.querySelector("#sampleLabel"),
  swapSlider: document.querySelector("#swapSlider"),
  swapLabel: document.querySelector("#swapLabel"),
  overlaySelect: document.querySelector("#overlaySelect"),
  modeScale: document.querySelector("#modeScale"),
  cloudSlider: document.querySelector("#cloudSlider"),
  cloudLabel: document.querySelector("#cloudLabel"),
  magicStat: document.querySelector("#magicStat"),
  fullEnergyStat: document.querySelector("#fullEnergyStat"),
  lowEnergyStat: document.querySelector("#lowEnergyStat"),
  maxResidualStat: document.querySelector("#maxResidualStat"),
  squareTitle: document.querySelector("#squareTitle"),
  caption: document.querySelector("#caption"),
  lineOverlay: document.querySelector("#lineOverlay"),
  barcodeCanvas: document.querySelector("#barcodeCanvas"),
  modeCanvas: document.querySelector("#modeCanvas"),
  geometryCanvas: document.querySelector("#geometryCanvas"),
  swapCanvas: document.querySelector("#swapCanvas"),
};

const state = {
  order: 4,
  kind: "magic",
  sample: 0,
  swapCount: 2,
  overlay: "all",
  modeScale: "linear",
  randomCloud: 64,
};

installListeners();
refreshClassOptions();
render();

function installListeners() {
  elements.orderSelect.addEventListener("change", () => {
    state.order = Number(elements.orderSelect.value);
    state.sample = 0;
    refreshClassOptions();
    render();
  });
  elements.classSelect.addEventListener("change", () => {
    state.kind = elements.classSelect.value;
    state.sample = 0;
    render();
  });
  elements.sampleSlider.addEventListener("input", () => {
    state.sample = Number(elements.sampleSlider.value);
    render();
  });
  elements.swapSlider.addEventListener("input", () => {
    state.swapCount = Number(elements.swapSlider.value);
    elements.swapLabel.textContent = String(state.swapCount);
    if (state.kind.startsWith("swap")) render();
  });
  elements.overlaySelect.addEventListener("change", () => {
    state.overlay = elements.overlaySelect.value;
    render();
  });
  elements.modeScale.addEventListener("change", () => {
    state.modeScale = elements.modeScale.value;
    render();
  });
  elements.cloudSlider.addEventListener("input", () => {
    state.randomCloud = Number(elements.cloudSlider.value);
    elements.cloudLabel.textContent = String(state.randomCloud);
    render();
  });
}

function refreshClassOptions() {
  const options = classOptions(state.order);
  if (state.order === 4) {
    options.splice(1, 0, {
      value: "low-mode",
      label: "Low-mode balanced non-magic",
    });
  }
  elements.classSelect.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  if (!options.some((option) => option.value === state.kind)) state.kind = "magic";
  elements.classSelect.value = state.kind;
}

function currentRecords() {
  if (state.kind === "low-mode") return [LOW_MODE_COUNTEREXAMPLE];
  return recordsFor(state.order, state.kind, state.swapCount);
}

function render() {
  const records = currentRecords();
  if (!records.length) return;
  state.sample = Math.min(state.sample, records.length - 1);
  elements.sampleSlider.max = String(records.length - 1);
  elements.sampleSlider.value = String(state.sample);
  elements.sampleLabel.textContent = `${state.sample + 1}/${records.length}`;
  elements.swapLabel.textContent = String(state.swapCount);
  elements.cloudLabel.textContent = String(state.randomCloud);

  const record = records[state.sample];
  const square = record.square;
  const analysis = analyzeSquare(square);

  elements.squareTitle.textContent = titleFor(record);
  elements.caption.textContent = `${record.source}. ${square.length}x${square.length}.`;
  elements.magicStat.textContent = isMagic(square) ? "yes" : "no";
  elements.fullEnergyStat.textContent = formatEnergy(analysis.completeEnergy);
  elements.lowEnergyStat.textContent = formatEnergy(analysis.lowModeEnergy);
  elements.maxResidualStat.textContent = formatNumber(analysis.maxResidual);

  drawLineOverlay(elements.lineOverlay, square, analysis, state.overlay);
  drawBarcode(elements.barcodeCanvas, analysis);
  drawModeSpectrum(elements.modeCanvas, analysis, state.modeScale);
  drawResidualGeometry(elements.geometryCanvas, square, analysis, state.randomCloud);
  drawSwapLandscape(elements.swapCanvas, square);
}

function analyzeSquare(square) {
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
  const covRows = rows.map((value) => value / (n * n));
  const covCols = cols.map((value) => value / (n * n));
  const covDiags = diags.map((value) => value / (n * n));
  const completeEnergy =
    sum(covRows.slice(0, n - 1).map((value) => value * value)) +
    sum(covCols.slice(0, n - 1).map((value) => value * value)) +
    sum(covDiags.map((value) => value * value));
  const lowModeEnergy = lowMode(square);
  const rowModes = modeDecomposition(rows);
  const colModes = modeDecomposition(cols);
  return {
    rows,
    cols,
    diags,
    covRows,
    covCols,
    covDiags,
    completeEnergy,
    lowModeEnergy,
    rowModes,
    colModes,
    maxResidual: Math.max(...[...rows, ...cols, ...diags].map(Math.abs)),
  };
}

function lowMode(square) {
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
  const diags = analyzeDiagonalResiduals(square).map((value) => value / (n * n));
  return (xz / (n * n)) ** 2 + (yz / (n * n)) ** 2 + sum(diags.map((value) => value * value));
}

function analyzeDiagonalResiduals(square) {
  const n = square.length;
  return [
    sum(Array.from({ length: n }, (_, i) => centeredHeight(square[i][i], n))),
    sum(Array.from({ length: n }, (_, i) => centeredHeight(square[i][n - 1 - i], n))),
  ];
}

function modeDecomposition(vector) {
  const n = vector.length;
  const modes = [];
  for (let mode = 1; mode < n; mode += 1) {
    const basis = dctBasis(n, mode);
    const coeff = dot(vector, basis);
    modes.push({ mode, coeff, energy: coeff * coeff });
  }
  return modes;
}

function dctBasis(n, mode) {
  const raw = Array.from({ length: n }, (_, i) => Math.cos((Math.PI * mode * (i + 0.5)) / n));
  const norm = Math.sqrt(dot(raw, raw));
  return raw.map((value) => value / norm);
}

function drawLineOverlay(canvas, square, analysis, overlay) {
  const ctx = resetCanvas(canvas);
  const n = square.length;
  const pad = 44;
  const size = Math.min(canvas.width - pad * 2, canvas.height - pad * 2);
  const cell = size / n;
  const left = (canvas.width - size) / 2;
  const top = (canvas.height - size) / 2;
  const maxZ = n * n - 1;
  const maxLine = Math.max(1, analysis.maxResidual);

  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(left, top, size, size);

  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const value = square[row][col];
      const z = centeredHeight(value, n);
      ctx.fillStyle = signedColor(z / maxZ, 0.3);
      ctx.fillRect(left + col * cell, top + row * cell, cell, cell);
      ctx.strokeStyle = "#d6cab5";
      ctx.strokeRect(left + col * cell, top + row * cell, cell, cell);
      ctx.fillStyle = "#202629";
      ctx.font = `${Math.max(12, Math.min(23, cell * 0.34))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(value), left + (col + 0.5) * cell, top + (row + 0.5) * cell);
    }
  }

  ctx.globalCompositeOperation = "multiply";
  if (overlay === "all" || overlay === "rows") {
    analysis.rows.forEach((value, row) => {
      ctx.fillStyle = signedColor(value / maxLine, 0.34);
      ctx.fillRect(left, top + row * cell, size, cell);
    });
  }
  if (overlay === "all" || overlay === "cols") {
    analysis.cols.forEach((value, col) => {
      ctx.fillStyle = signedColor(value / maxLine, 0.34);
      ctx.fillRect(left + col * cell, top, cell, size);
    });
  }
  ctx.globalCompositeOperation = "source-over";
  if (overlay === "all" || overlay === "diags") {
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(8, cell * 0.26);
    ctx.strokeStyle = signedColor(analysis.diags[0] / maxLine, 0.62);
    ctx.beginPath();
    ctx.moveTo(left + cell * 0.5, top + cell * 0.5);
    ctx.lineTo(left + size - cell * 0.5, top + size - cell * 0.5);
    ctx.stroke();
    ctx.strokeStyle = signedColor(analysis.diags[1] / maxLine, 0.62);
    ctx.beginPath();
    ctx.moveTo(left + size - cell * 0.5, top + cell * 0.5);
    ctx.lineTo(left + cell * 0.5, top + size - cell * 0.5);
    ctx.stroke();
  }

  drawLineResidualLabels(ctx, analysis, left, top, size, cell);
}

function drawLineResidualLabels(ctx, analysis, left, top, size, cell) {
  ctx.fillStyle = "#66706f";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  analysis.rows.forEach((value, row) => ctx.fillText(formatNumber(value), left - 8, top + (row + 0.5) * cell));
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  analysis.cols.forEach((value, col) => ctx.fillText(formatNumber(value), left + (col + 0.5) * cell, top - 8));
  ctx.textAlign = "left";
  ctx.fillText(`diag ${formatNumber(analysis.diags[0])}`, left + size + 10, top + 16);
  ctx.fillText(`anti ${formatNumber(analysis.diags[1])}`, left + size + 10, top + 34);
}

function drawBarcode(canvas, analysis) {
  const bars = [
    ...analysis.covRows.map((value, i) => ({ label: `R${i + 1}`, value: value * value, group: "row" })),
    ...analysis.covCols.map((value, i) => ({ label: `C${i + 1}`, value: value * value, group: "col" })),
    ...analysis.covDiags.map((value, i) => ({ label: i === 0 ? "D" : "A", value: value * value, group: "diag" })),
  ];
  drawBars(canvas, bars, { yLabel: "Cov(I,Z)^2" });
}

function drawModeSpectrum(canvas, analysis, scale) {
  const ctx = resetCanvas(canvas);
  const pad = { left: 54, right: 18, top: 26, bottom: 46 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;
  const modes = analysis.rowModes.map((rowMode, i) => ({
    mode: rowMode.mode,
    row: rowMode.energy,
    col: analysis.colModes[i].energy,
  }));
  const transform = (value) => (scale === "log" ? Math.log10(value + 1) : value);
  const max = Math.max(1, ...modes.flatMap((mode) => [transform(mode.row), transform(mode.col)]));
  drawFrame(ctx, pad, w, h, scale === "log" ? "log10(energy+1)" : "mode energy");

  const slot = w / modes.length;
  modes.forEach((mode, index) => {
    const x = pad.left + index * slot;
    const rowH = (transform(mode.row) / max) * h;
    const colH = (transform(mode.col) / max) * h;
    ctx.fillStyle = "#8f4f2f";
    ctx.fillRect(x + slot * 0.18, pad.top + h - rowH, slot * 0.25, rowH);
    ctx.fillStyle = "#2f6470";
    ctx.fillRect(x + slot * 0.52, pad.top + h - colH, slot * 0.25, colH);
    ctx.fillStyle = "#66706f";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(mode.mode), x + slot / 2, pad.top + h + 20);
  });
  drawLegend(ctx, canvas.width - 145, 22, [
    ["rows", "#8f4f2f"],
    ["cols", "#2f6470"],
  ]);
}

function drawResidualGeometry(canvas, square, analysis, count) {
  const ctx = resetCanvas(canvas);
  const n = square.length;
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const random = randomSquare(n, 42000 + n * 1000 + i);
    const randomAnalysis = analyzeSquare(random);
    points.push(projectModes(randomAnalysis.rowModes));
    points.push(projectModes(randomAnalysis.colModes));
  }
  const selected = [
    { ...projectModes(analysis.rowModes), label: "row", color: "#8f4f2f" },
    { ...projectModes(analysis.colModes), label: "col", color: "#2f6470" },
  ];
  const all = [...points, ...selected];
  const maxAbs = Math.max(1, ...all.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]));
  const pad = 44;
  const left = pad;
  const top = 24;
  const w = canvas.width - pad * 2;
  const h = canvas.height - 70;
  const sx = (value) => left + ((value / maxAbs + 1) / 2) * w;
  const sy = (value) => top + h - ((value / maxAbs + 1) / 2) * h;

  ctx.strokeStyle = "#d6cab5";
  ctx.strokeRect(left, top, w, h);
  ctx.beginPath();
  ctx.moveTo(left, sy(0));
  ctx.lineTo(left + w, sy(0));
  ctx.moveTo(sx(0), top);
  ctx.lineTo(sx(0), top + h);
  ctx.stroke();

  ctx.fillStyle = "rgba(102,112,111,0.22)";
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(sx(point.x), sy(point.y), 2.3, 0, Math.PI * 2);
    ctx.fill();
  });
  selected.forEach((point) => {
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(sx(point.x), sy(point.y), 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#202629";
    ctx.font = "13px Inter, sans-serif";
    ctx.fillText(point.label, sx(point.x) + 9, sy(point.y) - 9);
  });
  ctx.fillStyle = "#66706f";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText("mode 1 coefficient", left + w / 2 - 45, canvas.height - 20);
  ctx.save();
  ctx.translate(16, top + h / 2 + 45);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("mode 2 coefficient", 0, 0);
  ctx.restore();
}

function drawSwapLandscape(canvas, square) {
  const ctx = resetCanvas(canvas);
  const n = square.length;
  const total = n * n;
  const pad = 38;
  const size = Math.min(canvas.width - pad * 2, canvas.height - pad * 1.4);
  const left = (canvas.width - size) / 2;
  const top = 22;
  const cell = size / total;
  const energies = [];
  for (let a = 0; a < total; a += 1) {
    for (let b = a + 1; b < total; b += 1) {
      energies.push({ a, b, energy: completeEnergyAfterSwap(square, a, b) });
    }
  }
  const maxEnergy = Math.max(1, ...energies.map((item) => item.energy));
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(left, top, size, size);
  energies.forEach(({ a, b, energy }) => {
    ctx.fillStyle = heatColor(energy / maxEnergy);
    ctx.fillRect(left + a * cell, top + b * cell, Math.max(1, cell), Math.max(1, cell));
    ctx.fillRect(left + b * cell, top + a * cell, Math.max(1, cell), Math.max(1, cell));
  });
  ctx.strokeStyle = "#d6cab5";
  ctx.strokeRect(left, top, size, size);
  ctx.fillStyle = "#66706f";
  ctx.font = "12px Inter, sans-serif";
  ctx.fillText("cell index a", left + size / 2 - 26, top + size + 24);
  ctx.save();
  ctx.translate(left - 18, top + size / 2 + 30);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("cell index b", 0, 0);
  ctx.restore();
}

function drawBars(canvas, bars, options) {
  const ctx = resetCanvas(canvas);
  const pad = { left: 52, right: 18, top: 24, bottom: 52 };
  const w = canvas.width - pad.left - pad.right;
  const h = canvas.height - pad.top - pad.bottom;
  const max = Math.max(1e-9, ...bars.map((bar) => bar.value));
  drawFrame(ctx, pad, w, h, options.yLabel);
  const slot = w / bars.length;
  bars.forEach((bar, index) => {
    const bh = (bar.value / max) * h;
    ctx.fillStyle = bar.group === "row" ? "#8f4f2f" : bar.group === "col" ? "#2f6470" : "#9b6d24";
    ctx.fillRect(pad.left + index * slot + 2, pad.top + h - bh, Math.max(2, slot - 4), bh);
    ctx.save();
    ctx.translate(pad.left + index * slot + slot / 2, pad.top + h + 16);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "#66706f";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(bar.label, 0, 0);
    ctx.restore();
  });
}

function completeEnergyAfterSwap(square, a, b) {
  const n = square.length;
  const copy = cloneSquare(square);
  const ar = Math.floor(a / n);
  const ac = a % n;
  const br = Math.floor(b / n);
  const bc = b % n;
  [copy[ar][ac], copy[br][bc]] = [copy[br][bc], copy[ar][ac]];
  return analyzeSquare(copy).completeEnergy;
}

function projectModes(modes) {
  return {
    x: modes[0]?.coeff ?? 0,
    y: modes[1]?.coeff ?? 0,
  };
}

function titleFor(record) {
  if (record.family === "frenicle-880") return `Frénicle #${record.id}`;
  return `${record.family}: ${record.id}`;
}

function resetCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawFrame(ctx, pad, w, h, yLabel) {
  ctx.strokeStyle = "#d6cab5";
  ctx.strokeRect(pad.left, pad.top, w, h);
  ctx.fillStyle = "#66706f";
  ctx.font = "12px Inter, sans-serif";
  ctx.save();
  ctx.translate(16, pad.top + h / 2 + 45);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function drawLegend(ctx, x, y, items) {
  items.forEach(([label, color], index) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y + index * 18, 12, 12);
    ctx.fillStyle = "#66706f";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(label, x + 18, y + 10 + index * 18);
  });
}

function signedColor(value, alpha) {
  const t = Math.min(1, Math.abs(value));
  const color = value >= 0 ? [47, 100, 112] : [143, 79, 47];
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha * (0.18 + 0.82 * t)})`;
}

function heatColor(value) {
  const t = Math.max(0, Math.min(1, value));
  const low = [239, 226, 201];
  const high = [143, 79, 47];
  const rgb = low.map((component, index) => Math.round(component + (high[index] - component) * Math.sqrt(t)));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function dot(a, b) {
  return a.reduce((acc, value, index) => acc + value * b[index], 0);
}

function formatEnergy(value) {
  if (value === 0) return "0";
  if (value < 0.001) return value.toExponential(2);
  return value.toFixed(4);
}

function formatNumber(value) {
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
