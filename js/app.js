import { drawBars, drawHistogram, drawLineChart } from "./charts.js";
import {
  describeRecord,
  energySpectrum,
  isMagic,
  magicResiduals,
  windowResiduals,
} from "./math.js";
import {
  classOptions,
  databaseSummary,
  energyGalleryRecords,
  recordsFor,
} from "./squareData.js";
import {
  renderHeroStats,
  renderLanguage,
  renderLineCaption,
  renderEnergyGallery,
  renderSquare,
  renderStats,
  renderSurface,
} from "./renderers.js";

const elements = {
  heroStats: document.querySelector("#heroStats"),
  languageBlock: document.querySelector("#languageBlock"),
  orderSelect: document.querySelector("#orderSelect"),
  classSelect: document.querySelector("#classSelect"),
  sampleSlider: document.querySelector("#sampleSlider"),
  sampleLabel: document.querySelector("#sampleLabel"),
  swapSlider: document.querySelector("#swapSlider"),
  swapLabel: document.querySelector("#swapLabel"),
  exponentSelect: document.querySelector("#exponentSelect"),
  heatmapExponent: document.querySelector("#heatmapExponent"),
  energyGallery: document.querySelector("#energyGallery"),
  squareTitle: document.querySelector("#squareTitle"),
  magicBadge: document.querySelector("#magicBadge"),
  squareGrid: document.querySelector("#squareGrid"),
  recordCaption: document.querySelector("#recordCaption"),
  surfaceCanvas: document.querySelector("#surfaceCanvas"),
  lineCanvas: document.querySelector("#lineCanvas"),
  spectrumCanvas: document.querySelector("#spectrumCanvas"),
  histCanvas: document.querySelector("#histCanvas"),
  statsGrid: document.querySelector("#statsGrid"),
  lineCaption: document.querySelector("#lineCaption"),
};

let state = {
  order: 4,
  kind: "magic",
  sample: 0,
  swapCount: 2,
  exponents: [1, 2, 4, 8],
  heatmapExponent: 2,
};

renderHeroStats(elements.heroStats, databaseSummary());
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

  elements.exponentSelect.addEventListener("change", () => {
    state.exponents = elements.exponentSelect.value.split(",").map(Number);
    render();
  });

  elements.heatmapExponent.addEventListener("change", () => {
    state.heatmapExponent = Number(elements.heatmapExponent.value);
    renderEnergyGallery(
      elements.energyGallery,
      energyGalleryRecords(),
      state.heatmapExponent,
    );
  });
}

function refreshClassOptions() {
  const options = classOptions(state.order);
  elements.classSelect.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
  if (!options.some((option) => option.value === state.kind)) {
    state.kind = options[0].value;
  }
  elements.classSelect.value = state.kind;
}

function render() {
  const records = recordsFor(state.order, state.kind, state.swapCount);
  if (!records.length) return;
  const maxIndex = records.length - 1;
  state.sample = Math.min(state.sample, maxIndex);
  elements.sampleSlider.max = String(maxIndex);
  elements.sampleSlider.value = String(state.sample);
  elements.sampleLabel.textContent = `${state.sample + 1}/${records.length}`;
  elements.swapLabel.textContent = String(state.swapCount);

  const record = records[state.sample];
  const square = record.square;
  const description = describeRecord(record, square);
  const magic = isMagic(square);

  elements.squareTitle.textContent = titleFor(record);
  elements.magicBadge.textContent = magic ? "magic" : "non-magic";
  elements.magicBadge.classList.toggle("invalid", !magic);
  elements.recordCaption.textContent = captionFor(record, description);

  renderLanguage(elements.languageBlock, record);
  renderSquare(elements.squareGrid, square);
  renderSurface(elements.surfaceCanvas, square);
  renderStats(elements.statsGrid, record, square);
  renderLineCaption(elements.lineCaption, square);
  drawBars(elements.lineCanvas, magicResiduals(square), {
    title: "row, column, diagonal residuals",
  });
  renderSpectrum(square);
  renderResidualHistogram(square);
  renderEnergyGallery(
    elements.energyGallery,
    energyGalleryRecords(),
    state.heatmapExponent,
  );
}

function renderSpectrum(square) {
  const spectrum = energySpectrum(square, state.exponents);
  const series = state.exponents.map((p) => ({
    label: `p=${p}`,
    points: spectrum
      .filter((item) => item.p === p)
      .map((item) => ({ x: item.k, y: item.normalized })),
  }));
  drawLineChart(elements.spectrumCanvas, series, {
    yMin: 0,
    yMax: 1.05,
    xLabel: "window scale k",
    yLabel: "H_p(k) / log₂ windows",
  });
}

function renderResidualHistogram(square) {
  const n = square.length;
  const k = Math.max(2, Math.floor(n / 2));
  const residuals = windowResiduals(square, k);
  drawHistogram(elements.histCanvas, residuals);
}

function titleFor(record) {
  if (record.family === "frenicle-880") return `Frénicle #${record.id}`;
  return `${record.family} (${record.id})`;
}

function captionFor(record, description) {
  const swaps =
    record.swapCount > 0 ? `; ${record.swapCount} ${record.swapMode} swaps` : "";
  return `${record.source}${swaps}. Magic residual L1: ${description.magicScore}; complement-pair breaks: ${description.complementPairBreaks}.`;
}
