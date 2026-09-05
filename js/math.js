export function centeredHeight(value, n) {
  return 2 * value - (n * n + 1);
}

export function latticeCoordinate(index, n) {
  return 2 * index - (n - 1);
}

export function flatten(square) {
  return square.flat();
}

export function cloneSquare(square) {
  return square.map((row) => row.slice());
}

export function magicConstant(n) {
  return (n * (n * n + 1)) / 2;
}

export function lineSums(square) {
  const n = square.length;
  const rows = square.map((row) => row.reduce((sum, value) => sum + value, 0));
  const cols = Array.from({ length: n }, (_, col) =>
    square.reduce((sum, row) => sum + row[col], 0),
  );
  const diags = [
    square.reduce((sum, row, index) => sum + row[index], 0),
    square.reduce((sum, row, index) => sum + row[n - 1 - index], 0),
  ];
  return { rows, cols, diags };
}

export function magicResiduals(square) {
  const target = magicConstant(square.length);
  const sums = lineSums(square);
  return [...sums.rows, ...sums.cols, ...sums.diags].map((value) => value - target);
}

export function isNormalValueSet(square) {
  const n = square.length;
  const values = flatten(square).slice().sort((a, b) => a - b);
  return values.every((value, index) => value === index + 1) && values.length === n * n;
}

export function isMagic(square) {
  return isNormalValueSet(square) && magicResiduals(square).every((value) => value === 0);
}

export function magicScore(square) {
  const residuals = magicResiduals(square);
  return residuals.reduce((sum, value) => sum + Math.abs(value), 0);
}

export function covariance3D(square) {
  const n = square.length;
  const points = [];
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      points.push({
        x: latticeCoordinate(col, n),
        y: latticeCoordinate(row, n),
        z: centeredHeight(square[row][col], n),
      });
    }
  }

  const mean = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
      z: acc.z + point.z / points.length,
    }),
    { x: 0, y: 0, z: 0 },
  );

  const cov = {
    xx: 0,
    xy: 0,
    xz: 0,
    yy: 0,
    yz: 0,
    zz: 0,
  };
  for (const point of points) {
    const x = point.x - mean.x;
    const y = point.y - mean.y;
    const z = point.z - mean.z;
    cov.xx += (x * x) / points.length;
    cov.xy += (x * y) / points.length;
    cov.xz += (x * z) / points.length;
    cov.yy += (y * y) / points.length;
    cov.yz += (y * z) / points.length;
    cov.zz += (z * z) / points.length;
  }
  return { mean, cov };
}

export function mixedMomentXYZ(square) {
  const n = square.length;
  let total = 0;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      total +=
        latticeCoordinate(col, n) *
        latticeCoordinate(row, n) *
        centeredHeight(square[row][col], n);
    }
  }
  return total;
}

export function centeredWindows(square, k) {
  const n = square.length;
  const windows = [];
  for (let row = 0; row <= n - k; row += 1) {
    for (let col = 0; col <= n - k; col += 1) {
      const heights = [];
      for (let i = row; i < row + k; i += 1) {
        for (let j = col; j < col + k; j += 1) {
          heights.push(centeredHeight(square[i][j], n));
        }
      }
      windows.push({ row, col, heights });
    }
  }
  return windows;
}

export function localEnergy(window, p) {
  return window.heights.reduce((sum, height) => sum + Math.abs(height) ** p, 0);
}

export function shannonEntropy(weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  return weights.reduce((entropy, value) => {
    if (value <= 0) return entropy;
    const probability = value / total;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

export function energySpectrum(square, exponents) {
  const n = square.length;
  const rows = [];
  for (let k = 1; k <= n; k += 1) {
    const windows = centeredWindows(square, k);
    for (const p of exponents) {
      const weights = windows.map((window) => localEnergy(window, p));
      const maximum = Math.log2(windows.length || 1);
      rows.push({
        k,
        p,
        entropy: shannonEntropy(weights),
        maximum,
        normalized: maximum === 0 ? 1 : shannonEntropy(weights) / maximum,
      });
    }
  }
  return rows;
}

export function windowResiduals(square, k) {
  return centeredWindows(square, k).map((window) =>
    window.heights.reduce((sum, height) => sum + height, 0),
  );
}

export function complementPairBreaks(square) {
  const n = square.length;
  const target = n * n + 1;
  let breaks = 0;
  let pairs = 0;
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const mirrorRow = n - 1 - row;
      const mirrorCol = n - 1 - col;
      if (row > mirrorRow || (row === mirrorRow && col >= mirrorCol)) continue;
      pairs += 1;
      if (square[row][col] + square[mirrorRow][mirrorCol] !== target) breaks += 1;
    }
  }
  return { breaks, pairs };
}

export function describeRecord(record, square) {
  const n = square.length;
  const pairBreaks = complementPairBreaks(square);
  return {
    id: record.id,
    order: n,
    kind: record.kind,
    family: record.family,
    source: record.source,
    magic: isMagic(square),
    magicScore: magicScore(square),
    complementPairBreaks: `${pairBreaks.breaks}/${pairBreaks.pairs}`,
    xyzMoment: mixedMomentXYZ(square),
  };
}
