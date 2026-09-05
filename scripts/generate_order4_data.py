#!/usr/bin/env python3
"""Build the Frénicle-indexed order-4 magic-square dataset.

The source pages are the public Harvey Heinz/Recmath order-4 list, which
recalculates and lists the 880 Frénicle representatives one square per line.
The script writes both JSON and an ES module so the static web app can load the
data without a build step.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path


SOURCE_BASE = "http://recmath.org/Magic%20Squares/"
SOURCE_PAGES = [
    "order4lista.htm",
    "order4listb.htm",
    "order4listc.htm",
    "order4listd.htm",
]

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
JSON_PATH = DATA_DIR / "order4_magic_squares.json"
JS_PATH = DATA_DIR / "order4_magic_squares.js"


def line_sums(square: list[list[int]]) -> dict[str, object]:
    n = len(square)
    return {
        "rows": [sum(row) for row in square],
        "cols": [sum(square[i][j] for i in range(n)) for j in range(n)],
        "diags": [
            sum(square[i][i] for i in range(n)),
            sum(square[i][n - 1 - i] for i in range(n)),
        ],
    }


def is_magic(square: list[list[int]]) -> bool:
    n = len(square)
    target = n * (n * n + 1) // 2
    flat = [value for row in square for value in row]
    sums = line_sums(square)
    return (
        sorted(flat) == list(range(1, n * n + 1))
        and all(value == target for value in sums["rows"])
        and all(value == target for value in sums["cols"])
        and all(value == target for value in sums["diags"])
    )


def parse_page(page: str) -> list[dict[str, object]]:
    url = SOURCE_BASE + page
    with urllib.request.urlopen(url, timeout=30) as response:
        text = response.read().decode("latin1", errors="replace")

    records: list[dict[str, object]] = []
    for line in text.splitlines():
        nums = [int(value) for value in re.findall(r"\d+", line)]
        # sol, group, group-code, sixteen cells, complement-pair id, partner id
        if len(nums) != 21 or not 1 <= nums[0] <= 880:
            continue

        square_id, dudeney_group, group_code = nums[:3]
        cells = nums[3:19]
        square = [cells[i : i + 4] for i in range(0, 16, 4)]
        if not is_magic(square):
            raise ValueError(f"Parsed invalid order-4 square #{square_id}")

        records.append(
            {
                "id": square_id,
                "n": 4,
                "kind": "magic",
                "family": "frenicle-880",
                "source": "Harvey Heinz/Recmath Frénicle index list",
                "sourcePage": url,
                "dudeneyGroup": dudeney_group,
                "groupCode": group_code,
                "complementPairId": nums[19],
                "complementPartnerId": nums[20],
                "square": square,
                "lineSums": line_sums(square),
                "isMagic": True,
                "language": {
                    "object": "normal-magic-square",
                    "order": 4,
                    "valueSet": "1..16",
                    "constraints": ["rows", "columns", "main-diagonals"],
                    "equivalence": "Frénicle representative",
                },
            }
        )
    return records


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    records: list[dict[str, object]] = []
    for page in SOURCE_PAGES:
        records.extend(parse_page(page))

    records.sort(key=lambda item: int(item["id"]))
    ids = [item["id"] for item in records]
    if len(records) != 880 or ids != list(range(1, 881)):
        raise ValueError(f"Expected ids 1..880, got {len(records)} records")

    payload = {
        "metadata": {
            "name": "Frénicle indexed order-4 normal magic squares",
            "count": len(records),
            "order": 4,
            "values": "1..16",
            "magicConstant": 34,
            "sources": [SOURCE_BASE + page for page in SOURCE_PAGES],
        },
        "records": records,
    }

    JSON_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    JS_PATH.write_text(
        "export const ORDER4_MAGIC_SQUARES = "
        + json.dumps(records, separators=(",", ":"))
        + ";\n\n"
        + "export const ORDER4_METADATA = "
        + json.dumps(payload["metadata"], separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(records)} records to {JSON_PATH.relative_to(ROOT)}")
    print(f"Wrote ES module to {JS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
