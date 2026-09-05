import { cloneSquare } from "./math.js";

export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function loShu() {
  return [
    [8, 1, 6],
    [3, 5, 7],
    [4, 9, 2],
  ];
}

export function siamese(n) {
  const square = Array.from({ length: n }, () => Array(n).fill(0));
  let row = 0;
  let col = Math.floor(n / 2);
  for (let value = 1; value <= n * n; value += 1) {
    square[row][col] = value;
    const nextRow = (row - 1 + n) % n;
    const nextCol = (col + 1) % n;
    if (square[nextRow][nextCol]) {
      row = (row + 1) % n;
    } else {
      row = nextRow;
      col = nextCol;
    }
  }
  return square;
}

export function linearOddSquare(n, matrix = [[1, 1], [1, 2]], shift = [0, 0]) {
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => {
      const high = positiveMod(matrix[0][0] * row + matrix[0][1] * col + shift[0], n);
      const low = positiveMod(matrix[1][0] * row + matrix[1][1] * col + shift[1], n);
      return n * high + low + 1;
    }),
  );
}

export function doublyEvenMagic(n) {
  if (n % 4 !== 0) {
    throw new Error("Doubly-even construction requires n divisible by 4");
  }
  const complement = n * n + 1;
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => {
      const value = row * n + col + 1;
      const keep =
        row % 4 === col % 4 || (row % 4) + (col % 4) === 3;
      return keep ? value : complement - value;
    }),
  );
}

// Conway's LUX method for singly-even orders (n = 4m + 2, m >= 1).
// Builds a (2m+1)×(2m+1) letter grid (m+1 rows of L, 1 row of U, m-1 rows
// of X) then swaps the middle U with the L immediately above it. Each
// cell of the letter grid corresponds to a 2×2 block in the final square.
// The Siamese magic square of order 2m+1 gives each cell its visit order
// v ∈ {1..(2m+1)²}; the corresponding 2×2 block is filled with values
// 4v-3..4v laid out by the letter's prescribed pattern (L, U, or X).
export function singlyEvenMagic(n) {
  if (n % 4 !== 2 || n < 6) {
    throw new Error("Singly-even construction requires n = 4m + 2 with m >= 1");
  }
  const m = (n - 2) / 4;
  const k = 2 * m + 1;
  const letters = Array.from({ length: k }, (_, row) => {
    if (row < m + 1) return Array(k).fill("L");
    if (row === m + 1) return Array(k).fill("U");
    return Array(k).fill("X");
  });
  // Swap the middle U with the L directly above it.
  const middleCol = m;
  letters[m + 1][middleCol] = "L";
  letters[m][middleCol] = "U";

  const visitOrder = siamese(k);
  // patterns[letter](i, j) returns offset 0..3 mapping local (i, j) within
  // a 2×2 block to which of {4v-3, 4v-2, 4v-1, 4v} goes there. The L/U/X
  // pattern is a permutation of {0, 1, 2, 3} over the four 2×2 positions.
  const patterns = {
    // L: TL=4v, TR=4v-3, BL=4v-2, BR=4v-1
    L: [
      [3, 0],
      [1, 2],
    ],
    // U: TL=4v-3, TR=4v, BL=4v-2, BR=4v-1
    U: [
      [0, 3],
      [1, 2],
    ],
    // X: TL=4v-3, TR=4v, BL=4v-1, BR=4v-2
    X: [
      [0, 3],
      [2, 1],
    ],
  };

  const square = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const v = visitOrder[i][j];
      const pattern = patterns[letters[i][j]];
      const base = 4 * (v - 1);
      for (let di = 0; di < 2; di += 1) {
        for (let dj = 0; dj < 2; dj += 1) {
          square[2 * i + di][2 * j + dj] = base + pattern[di][dj] + 1;
        }
      }
    }
  }
  return square;
}

export function rotateSquare(square) {
  return square[0].map((_, col) => square.map((row) => row[col]).reverse());
}

export function reflectSquare(square) {
  return square.map((row) => row.slice().reverse());
}

export function dihedralSquares(square) {
  const variants = [];
  let current = cloneSquare(square);
  for (let step = 0; step < 4; step += 1) {
    variants.push(current);
    variants.push(reflectSquare(current));
    current = rotateSquare(current);
  }
  const seen = new Set();
  return variants.filter((variant) => {
    const key = variant.flat().join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function randomSquare(n, seed = 1) {
  const rng = makeRng(seed);
  const values = Array.from({ length: n * n }, (_, index) => index + 1);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return chunk(values, n);
}

export function swapPerturbation(baseSquare, count, mode = "random", seed = 1) {
  const square = cloneSquare(baseSquare);
  const n = square.length;
  const rng = makeRng(seed);

  for (let step = 0; step < count; step += 1) {
    if (mode === "complement") {
      const row = Math.floor(rng() * n);
      const col = Math.floor(rng() * n);
      const mirrorRow = n - 1 - row;
      const mirrorCol = n - 1 - col;
      [square[row][col], square[mirrorRow][mirrorCol]] = [
        square[mirrorRow][mirrorCol],
        square[row][col],
      ];
    } else {
      const a = Math.floor(rng() * n * n);
      let b = Math.floor(rng() * n * n);
      if (a === b) b = (b + 1) % (n * n);
      const ar = Math.floor(a / n);
      const ac = a % n;
      const br = Math.floor(b / n);
      const bc = b % n;
      [square[ar][ac], square[br][bc]] = [square[br][bc], square[ar][ac]];
    }
  }
  return square;
}

export function buildRecord(square, attributes) {
  return {
    id: attributes.id,
    n: square.length,
    kind: attributes.kind,
    family: attributes.family,
    source: attributes.source,
    swapCount: attributes.swapCount ?? 0,
    swapMode: attributes.swapMode ?? "none",
    seed: attributes.seed ?? 0,
    square,
    language: {
      object: attributes.kind,
      order: square.length,
      valueSet: `1..${square.length * square.length}`,
      perturbation: attributes.swapMode ?? "none",
      constraints: attributes.kind === "magic" ? ["rows", "columns", "main-diagonals"] : [],
    },
  };
}

function chunk(values, size) {
  const rows = [];
  for (let i = 0; i < values.length; i += size) rows.push(values.slice(i, i + size));
  return rows;
}

function positiveMod(value, n) {
  return ((value % n) + n) % n;
}
