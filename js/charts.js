const COLORS = ["#8f4f2f", "#2f6470", "#6b6f3a", "#7a4d7e", "#3f5d87"];

export function clearCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

export function drawLineChart(canvas, series, options = {}) {
  const ctx = clearCanvas(canvas);
  const padding = { left: 58, right: 22, top: 28, bottom: 48 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const allPoints = series.flatMap((item) => item.points);
  const xValues = allPoints.map((point) => point.x);
  const yValues = allPoints.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(options.yMin ?? Math.min(...yValues), 0);
  const yMax = Math.max(options.yMax ?? Math.max(...yValues), 1);

  drawAxes(ctx, padding, width, height, { xMin, xMax, yMin, yMax }, options);

  series.forEach((item, index) => {
    ctx.strokeStyle = COLORS[index % COLORS.length];
    ctx.lineWidth = 3;
    ctx.beginPath();
    item.points.forEach((point, pointIndex) => {
      const x = scale(point.x, xMin, xMax, padding.left, padding.left + width);
      const y = scale(point.y, yMin, yMax, padding.top + height, padding.top);
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const last = item.points[item.points.length - 1];
    ctx.fillStyle = COLORS[index % COLORS.length];
    ctx.font = "14px Inter, sans-serif";
    ctx.fillText(
      item.label,
      scale(last.x, xMin, xMax, padding.left, padding.left + width) + 8,
      scale(last.y, yMin, yMax, padding.top + height, padding.top),
    );
  });
}

export function drawBars(canvas, values, options = {}) {
  const ctx = clearCanvas(canvas);
  const padding = { left: 48, right: 18, top: 24, bottom: 44 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const zeroY = padding.top + height / 2;
  const barWidth = width / values.length;

  ctx.strokeStyle = "#d8cdb9";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(padding.left + width, zeroY);
  ctx.stroke();

  values.forEach((value, index) => {
    const x = padding.left + index * barWidth + 2;
    const h = (Math.abs(value) / maxAbs) * (height / 2 - 6);
    ctx.fillStyle = value === 0 ? "#9aa09c" : value > 0 ? "#2f6470" : "#8f4f2f";
    ctx.fillRect(x, value >= 0 ? zeroY - h : zeroY, Math.max(2, barWidth - 4), h);
  });

  ctx.fillStyle = "#66706f";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(options.title ?? "residuals", padding.left, canvas.height - 16);
}

export function drawHistogram(canvas, values) {
  const ctx = clearCanvas(canvas);
  const padding = { left: 46, right: 18, top: 24, bottom: 42 };
  const width = canvas.width - padding.left - padding.right;
  const height = canvas.height - padding.top - padding.bottom;
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const entries = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(1, ...entries.map((entry) => entry[1]));
  const barWidth = width / entries.length;

  entries.forEach(([value, count], index) => {
    const h = (count / maxCount) * height;
    ctx.fillStyle = value === 0 ? "#9aa09c" : value > 0 ? "#2f6470" : "#8f4f2f";
    ctx.fillRect(
      padding.left + index * barWidth + 1,
      padding.top + height - h,
      Math.max(2, barWidth - 2),
      h,
    );
  });

  ctx.fillStyle = "#66706f";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText("signed local window sums", padding.left, canvas.height - 14);
}

function drawAxes(ctx, padding, width, height, bounds, options) {
  ctx.strokeStyle = "#d8cdb9";
  ctx.lineWidth = 1;
  ctx.strokeRect(padding.left, padding.top, width, height);
  ctx.fillStyle = "#66706f";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(options.xLabel ?? "scale k", padding.left + width / 2 - 20, padding.top + height + 34);
  ctx.save();
  ctx.translate(17, padding.top + height / 2 + 40);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(options.yLabel ?? "normalized entropy", 0, 0);
  ctx.restore();

  for (let tick = 0; tick <= 4; tick += 1) {
    const y = padding.top + (height * tick) / 4;
    ctx.strokeStyle = "#eee4d2";
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + width, y);
    ctx.stroke();
    const value = bounds.yMax - ((bounds.yMax - bounds.yMin) * tick) / 4;
    ctx.fillStyle = "#66706f";
    ctx.fillText(value.toFixed(2), 12, y + 4);
  }
}

function scale(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}
