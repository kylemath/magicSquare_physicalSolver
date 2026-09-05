import {
  centeredHeight,
  covariance3D,
  describeRecord,
  isMagic,
  lineSums,
  magicConstant,
  magicScore,
  magicResiduals,
  mixedMomentXYZ,
} from "./math.js";
import { clearCanvas } from "./charts.js";

export function renderHeroStats(element, summary) {
  element.innerHTML = [
    ["Order-4 records", summary.order4MagicRecords.toLocaleString()],
    ["Baseline covariance", "fixed"],
    ["Primary signal", "H_p(k)"],
    ["Comparison classes", summary.generatedFamilies.join(", ")],
  ]
    .map(
      ([label, value]) => `
        <div class="hero-stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

export function renderLanguage(element, record) {
  const language = {
    square: record.language?.object ?? record.kind,
    order: record.n,
    class: record.kind,
    family: record.family,
    perturbation: {
      swaps: record.swapCount ?? 0,
      mode: record.swapMode ?? "none",
      seed: record.seed ?? null,
    },
    constraints: record.language?.constraints ?? [],
    observables: ["line residuals", "3D covariance", "xyz moment", "H_p(k)"],
  };
  element.textContent = JSON.stringify(language, null, 2);
}

export function renderSquare(element, square) {
  const n = square.length;
  const maxAbs = n * n - 1;
  element.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`;
  element.innerHTML = "";
  for (const row of square) {
    for (const value of row) {
      const height = centeredHeight(value, n);
      const cell = document.createElement("div");
      cell.className = `cell ${height < 0 ? "negative" : ""}`;
      cell.textContent = value;
      cell.style.setProperty("--height", `${Math.abs(height) / maxAbs}`);
      cell.style.setProperty("--after-height", `${Math.abs(height) / maxAbs}`);
      cell.style.setProperty("font-size", n <= 4 ? "1.2rem" : "1rem");
      cell.style.setProperty("--bar", `${Math.max(4, (Math.abs(height) / maxAbs) * 70)}%`);
      cell.style.setProperty("background", cellBackground(height, maxAbs));
      element.appendChild(cell);
    }
  }
}

export function renderStats(element, record, square) {
  const { cov } = covariance3D(square);
  const stats = [
    ["Magic residual L1", formatNumber(describeRecord(record, square).magicScore)],
    ["XYZ mixed moment", formatNumber(mixedMomentXYZ(square))],
    ["Cov(x,z), Cov(y,z)", `${formatNumber(cov.xz)}, ${formatNumber(cov.yz)}`],
    ["Var(z)", formatNumber(cov.zz)],
    ["Magic constant", formatNumber(magicConstant(square.length))],
    ["Line target", formatLineTarget(square)],
  ];
  element.innerHTML = stats
    .map(
      ([label, value]) => `
        <div class="stat">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

export function renderLineCaption(element, square) {
  const sums = lineSums(square);
  const target = magicConstant(square.length);
  element.textContent = `Target ${target}. Rows ${sums.rows.join(", ")}; columns ${sums.cols.join(
    ", ",
  )}; diagonals ${sums.diags.join(", ")}.`;
}

export function renderSurface(canvas, square) {
  const ctx = clearCanvas(canvas);
  const n = square.length;
  const maxHeight = n * n - 1;
  const scale = Math.min(canvas.width, canvas.height) / (n + 3);
  const origin = { x: canvas.width * 0.52, y: canvas.height * 0.72 };

  const points = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const x = col - (n - 1) / 2;
      const y = row - (n - 1) / 2;
      const z = centeredHeight(square[row][col], n) / maxHeight;
      points.push({ row, col, x, y, z, value: square[row][col] });
    }
  }

  drawGroundGrid(ctx, points, origin, scale, n);
  points
    .sort((a, b) => a.x + a.y - (b.x + b.y))
    .forEach((point) => drawBar(ctx, point, origin, scale));
}

export function renderEnergyGallery(element, records, exponent) {
  const n = 8;
  const maxEnergy = (n * n - 1) ** exponent;
  element.innerHTML = records
    .map((record, index) => {
      const square = record.square;
      const cells = square
        .flatMap((row, rowIndex) =>
          row.map((value, colIndex) => {
            const height = centeredHeight(value, n);
            const energy = Math.abs(height) ** exponent;
            return {
              value,
              row: rowIndex,
              col: colIndex,
              energy,
              color: heatColor(energy / maxEnergy),
            };
          }),
        )
        .map(
          (cell) => `
            <div
              class="heatmap-cell"
              style="background:${cell.color}"
              title="row ${cell.row + 1}, col ${cell.col + 1}: value ${cell.value}, energy ${formatNumber(cell.energy)}"
            ></div>
          `,
        )
        .join("");

      return `
        <article class="heatmap-card">
          <h3>${index + 1}. ${record.kind === "magic" ? "Magic" : "Random"}</h3>
          <div class="heatmap-meta">
            <span>${record.family}</span>
            <span>L1 ${formatNumber(magicScore(square))}</span>
          </div>
          <div class="heatmap-grid" aria-label="${record.id} energy heatmap">${cells}</div>
          <div class="heatmap-legend">
            <span>low</span>
            <span class="legend-ramp"></span>
            <span>high</span>
          </div>
          <p class="muted heatmap-note">${isMagic(square) ? "valid magic" : "random permutation"}</p>
        </article>
      `;
    })
    .join("");
}

function drawGroundGrid(ctx, points, origin, scale, n) {
  ctx.strokeStyle = "#d8cdb9";
  ctx.lineWidth = 1;
  for (let row = 0; row < n; row += 1) {
    const rowPoints = points.filter((point) => point.row === row);
    drawPath(ctx, rowPoints.map((point) => project(point.x, point.y, 0, origin, scale)));
  }
  for (let col = 0; col < n; col += 1) {
    const colPoints = points.filter((point) => point.col === col);
    drawPath(ctx, colPoints.map((point) => project(point.x, point.y, 0, origin, scale)));
  }
}

function drawBar(ctx, point, origin, scale) {
  const base = project(point.x, point.y, 0, origin, scale);
  const top = project(point.x, point.y, point.z * 2.2, origin, scale);
  ctx.strokeStyle = point.z >= 0 ? "#2f6470" : "#8f4f2f";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  ctx.fillStyle = point.z >= 0 ? "#2f6470" : "#8f4f2f";
  ctx.beginPath();
  ctx.arc(top.x, top.y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fffdf7";
  ctx.font = "700 11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(point.value), top.x, top.y);
}

function drawPath(ctx, projected) {
  ctx.beginPath();
  projected.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
}

function project(x, y, z, origin, scale) {
  return {
    x: origin.x + (x - y) * scale * 0.78,
    y: origin.y + (x + y) * scale * 0.37 - z * scale,
  };
}

function cellBackground(height, maxAbs) {
  const alpha = 0.1 + 0.42 * (Math.abs(height) / maxAbs);
  const color = height >= 0 ? `rgba(47, 100, 112, ${alpha})` : `rgba(143, 79, 47, ${alpha})`;
  return color;
}

function heatColor(normalized) {
  const t = Math.max(0, Math.min(1, normalized));
  const low = [239, 227, 206];
  const mid = [47, 100, 112];
  const high = [143, 79, 47];
  const a = t < 0.5 ? low : mid;
  const b = t < 0.5 ? mid : high;
  const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  const rgb = a.map((value, index) => Math.round(value + (b[index] - value) * local));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function formatLineTarget(square) {
  const residuals = magicResiduals(square);
  const max = Math.max(...residuals.map((value) => Math.abs(value)));
  return max === 0 ? "all constrained lines balanced" : `max residual ${formatNumber(max)}`;
}

function formatNumber(value) {
  if (Math.abs(value) >= 1000) return value.toLocaleString();
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3);
}
