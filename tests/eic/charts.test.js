"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const C = require(path.join(__dirname, "../../static/eic/charts.js"));

test("cellColor: sequential teal — 0% is paper, 100% is deep teal; null share -> grey", () => {
  assert.equal(C.cellColor(1).toLowerCase(), "#08454c");   // deep teal
  assert.equal(C.cellColor(0.5).toLowerCase(), "#1899a2"); // EIC teal at the midpoint
  assert.equal(C.cellColor(0).toLowerCase(), "#f4f6fe");   // paper: nothing here, no colour reward
  assert.equal(C.cellColor(null).toLowerCase(), "#c3cad5"); // nothing read
});

test("cellColor: shares stay distinguishable along the whole scale", () => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(...p(a).map((v, i) => v - p(b)[i]));
  assert.ok(dist(C.cellColor(0), C.cellColor(0.2)) > 40);
  assert.ok(dist(C.cellColor(0.8), C.cellColor(1)) > 40);
});

test("cellColor: out-of-range shares clamp to endpoints", () => {
  assert.equal(C.cellColor(2).toLowerCase(), "#08454c");
  assert.equal(C.cellColor(-1).toLowerCase(), "#f4f6fe");
});

test("cellColor: shared-code view uses the navy family, matching the badges", () => {
  assert.equal(C.cellColor(1, "bodies").toLowerCase(), "#1a1463");  // EIC navy
  assert.equal(C.cellColor(0, "bodies").toLowerCase(), "#f4f6fe");   // paper
  assert.equal(C.cellColor(null, "bodies").toLowerCase(), "#c3cad5");
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => Math.hypot(...p(a).map((v, i) => v - p(b)[i]));
  assert.ok(dist(C.cellColor(0, "bodies"), C.cellColor(0.2, "bodies")) > 40);
  assert.ok(dist(C.cellColor(0.8, "bodies"), C.cellColor(1, "bodies")) > 40);
});

test("waffleSquares: 100 squares, worst band first, counts sum to total", () => {
  // real data shape: 4189 none, 2310 one-or-two, 337 three-to-five, 232 six-or-seven of 7068
  const sq = C.waffleSquares([{ count: 4189 }, { count: 2310 }, { count: 337 }, { count: 232 }], 7068);
  assert.equal(sq.length, 100);
  assert.deepEqual(sq.reduce((acc, b) => (acc[b] = (acc[b] || 0) + 1, acc), {}), { 0: 59, 1: 33, 2: 5, 3: 3 });
  assert.equal(sq[0], 0); // worst first
  assert.equal(sq[99], 3);
});
