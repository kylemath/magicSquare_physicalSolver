import { ORDER4_MAGIC_SQUARES, ORDER4_METADATA } from "../data/order4_magic_squares.js";
import {
  buildRecord,
  dihedralSquares,
  doublyEvenMagic,
  linearOddSquare,
  loShu,
  randomSquare,
  siamese,
  singlyEvenMagic,
  swapPerturbation,
} from "./generators.js";

const MAGIC_3 = [
  buildRecord(loShu(), {
    id: "lo-shu",
    kind: "magic",
    family: "lo-shu",
    source: "Classical 3x3 normal magic square",
  }),
];

const MAGIC_5 = [
  buildRecord(siamese(5), {
    id: "siamese-5",
    kind: "magic",
    family: "siamese",
    source: "Odd-order Siamese construction",
  }),
  buildRecord(linearOddSquare(5, [[1, 2], [3, 4]]), {
    id: "linear-5-a",
    kind: "magic",
    family: "linear-pandiagonal",
    source: "Linear finite-field construction over Z/5Z",
  }),
  buildRecord(linearOddSquare(5, [[2, 1], [3, 1]]), {
    id: "linear-5-b",
    kind: "magic",
    family: "linear-pandiagonal",
    source: "Linear finite-field construction over Z/5Z",
  }),
];

const MAGIC_6 = dihedralSquares(singlyEvenMagic(6)).map((square, index) =>
  buildRecord(square, {
    id: `lux-6-${index + 1}`,
    kind: "magic",
    family: "lux-singly-even",
    source: "Conway's LUX method for singly-even order, transformed by dihedral symmetry",
  }),
);

const MAGIC_7 = [
  buildRecord(siamese(7), {
    id: "siamese-7",
    kind: "magic",
    family: "siamese",
    source: "Odd-order Siamese construction",
  }),
  buildRecord(linearOddSquare(7, [[1, 3], [2, 1]]), {
    id: "linear-7-a",
    kind: "magic",
    family: "linear-pandiagonal",
    source: "Linear finite-field construction over Z/7Z",
  }),
  buildRecord(linearOddSquare(7, [[2, 1], [3, 1]]), {
    id: "linear-7-b",
    kind: "magic",
    family: "linear-pandiagonal",
    source: "Linear finite-field construction over Z/7Z",
  }),
];

const MAGIC_8 = dihedralSquares(doublyEvenMagic(8)).map((square, index) =>
  buildRecord(square, {
    id: `doubly-even-8-${index + 1}`,
    kind: "magic",
    family: "doubly-even",
    source: "Doubly-even 4k construction, transformed by dihedral symmetry",
  }),
);

const MAGIC_BY_ORDER = {
  3: MAGIC_3,
  4: ORDER4_MAGIC_SQUARES,
  5: MAGIC_5,
  6: MAGIC_6,
  7: MAGIC_7,
  8: MAGIC_8,
};

export { ORDER4_METADATA };

export function classOptions(order) {
  const n = Number(order);
  return [
    { value: "magic", label: n === 4 ? "Magic: Frénicle 880" : "Magic examples" },
    { value: "random", label: "Random shuffled square" },
    { value: "swap-random", label: "Magic base + random swaps" },
    { value: "swap-complement", label: "Magic base + complement-pair swaps" },
  ];
}

export function recordsFor(order, kind, swapCount = 0) {
  const n = Number(order);
  const magicRecords = MAGIC_BY_ORDER[n] ?? [];

  if (kind === "magic") return magicRecords;

  if (kind === "random") {
    return Array.from({ length: 24 }, (_, index) =>
      buildRecord(randomSquare(n, 9000 + n * 100 + index), {
        id: `random-${n}-${index + 1}`,
        kind: "random",
        family: "uniform-permutation",
        source: "Seeded Fisher-Yates shuffle over all normal square permutations",
        seed: 9000 + n * 100 + index,
      }),
    );
  }

  const mode = kind === "swap-complement" ? "complement" : "random";
  const base = magicRecords[0]?.square;
  if (!base) return [];
  return Array.from({ length: 24 }, (_, index) =>
    buildRecord(swapPerturbation(base, swapCount, mode, 5000 + index), {
      id: `${kind}-${n}-${swapCount}-${index + 1}`,
      kind,
      family: "perturbed-magic-base",
      source: `Seeded ${mode} swaps from a valid order-${n} magic square`,
      swapCount,
      swapMode: mode,
      seed: 5000 + index,
    }),
  );
}

export function databaseSummary() {
  return {
    order4MagicRecords: ORDER4_MAGIC_SQUARES.length,
    order4Source: ORDER4_METADATA.name,
    generatedFamilies: [
      "magic",
      "random",
      "swap-random",
      "swap-complement",
    ],
  };
}

export function energyGalleryRecords() {
  const magic = MAGIC_8.slice(0, 5);
  const random = Array.from({ length: 5 }, (_, index) =>
    buildRecord(randomSquare(8, 18000 + index), {
      id: `random-8-gallery-${index + 1}`,
      kind: "random",
      family: "uniform-permutation",
      source: "Seeded random shuffle for 8x8 heatmap control",
      seed: 18000 + index,
    }),
  );
  return [...magic, ...random];
}
