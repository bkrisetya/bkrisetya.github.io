"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const C = require(path.join(__dirname, "../../static/eic/charts.js"));

test("cellColor: full evidence -> pure share colour; null share -> grey", () => {
  assert.equal(C.cellColor(1, 100).toLowerCase(), "#1899a2");   // teal
  assert.equal(C.cellColor(0, 100).toLowerCase(), "#e41e7c");   // magenta
  assert.equal(C.cellColor(0.5, 100).toLowerCase(), "#7e5c8f"); // midpoint
  assert.equal(C.cellColor(null, 5).toLowerCase(), "#c3cad5");  // nothing read
});

test("cellColor: thin evidence is washed toward neutral, regardless of share", () => {
  const oneCodeAllYes = C.cellColor(1, 1);
  const neutral = C.cellColor(0.5, 0);
  // a 100%-yes cell backed by a single code must be much closer to neutral than to teal
  const dist = (hexA, hexB) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = p(hexA), b = p(hexB);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  };
  assert.ok(dist(oneCodeAllYes, neutral) < dist(oneCodeAllYes, "#1899a2") / 2);
});

test("cellColor: out-of-range shares clamp to endpoints", () => {
  assert.equal(C.cellColor(2, 100).toLowerCase(), "#1899a2");
  assert.equal(C.cellColor(-1, 100).toLowerCase(), "#e41e7c");
});

test("waffleSquares: 100 squares, worst band first, counts sum to total", () => {
  // real data shape: 4189 none, 2310 one-or-two, 337 three-to-five, 232 six-or-seven of 7068
  const sq = C.waffleSquares([{ count: 4189 }, { count: 2310 }, { count: 337 }, { count: 232 }], 7068);
  assert.equal(sq.length, 100);
  assert.deepEqual(sq.reduce((acc, b) => (acc[b] = (acc[b] || 0) + 1, acc), {}), { 0: 59, 1: 33, 2: 5, 3: 3 });
  assert.equal(sq[0], 0); // worst first
  assert.equal(sq[99], 3);
});
