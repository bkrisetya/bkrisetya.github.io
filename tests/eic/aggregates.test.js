"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const A = require(path.join(__dirname, "../../static/eic/aggregates.js"));

const PRINCIPLES = [
  { id: "selflessness", name: "Selflessness" }, { id: "integrity", name: "Integrity" },
  { id: "objectivity", name: "Objectivity" }, { id: "accountability", name: "Accountability" },
  { id: "openness", name: "Openness" }, { id: "honesty", name: "Honesty" },
  { id: "leadership", name: "Leadership" },
];
const n = (s) => Object.fromEntries(A.PRINCIPLE_IDS.map((p, i) => [p, { covered: { y: "yes", n: "no", p: "partial", u: "unknown" }[s[i]] || "unknown" }]));

test("scoreOf counts only yes", () => {
  assert.equal(A.scoreOf(n("yyynnnn")), 3);
  assert.equal(A.scoreOf(n("ppppppp")), 0);
  assert.equal(A.scoreOf(null), 0);
});

test("heroNumbers reconciles parts to total", () => {
  const meta = { total: 10, coverage: { own: 2, shared: 6, tocheck: 2, periphery_out: 0, notscoped: 0 } };
  const h = A.heroNumbers(meta);
  assert.deepEqual([h.total, h.shared, h.own, h.tocheck], [10, 6, 2, 2]);
  assert.equal(h.reconciles, true);
  assert.equal(A.heroNumbers({ total: 11, coverage: meta.coverage }).reconciles, false);
});

test("scoreDistribution bins 0..7 and sums to input length", () => {
  const orgs = [{ nolan: n("yyyyyyy") }, { nolan: n("nnnnnnn") }, { nolan: n("yynnnnn") }, { nolan: n("yynnnnn") }];
  const d = A.scoreDistribution(orgs);
  assert.equal(d.length, 8);
  assert.equal(d[7].count, 1); assert.equal(d[0].count, 1); assert.equal(d[2].count, 2);
  assert.equal(d.reduce((a, b) => a + b.count, 0), 4);
});

test("principleBars sorted weakest first", () => {
  const orgs = [{ nolan: n("yyyyyyy") }, { nolan: n("yyyynnn") }];
  const rows = A.principleBars(orgs, PRINCIPLES);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].yes, 1); // honesty/leadership group first
  assert.equal(rows[6].yes, 2);
  assert.equal(rows.every((r) => r.yes + r.partial + r.no + r.unknown === 2), true);
});

test("heatmap cells carry counts and share; empty cells share null", () => {
  const orgs = [
    { category: "Health", nolan: n("yyyyyyy") },
    { category: "Health", nolan: n("nnnnnnn") },
    { category: "Justice", nolan: n("ynnnnnn") },
  ];
  const hm = A.heatmap(orgs, ["Health", "Justice", "Empty"], PRINCIPLES);
  assert.deepEqual(hm.rows.map((r) => r.name), ["Health", "Justice", "Empty"]);
  assert.equal(hm.rows[0].coded, 2);
  const healthSelf = hm.cells.get("Health|selflessness");
  assert.deepEqual([healthSelf.yes, healthSelf.no, healthSelf.total], [1, 1, 2]);
  assert.equal(healthSelf.share, 0.5);
  assert.equal(hm.cells.get("Empty|selflessness"), undefined); // no coded orgs -> no cell
  assert.equal(hm.rows[2].coded, 0);
});

test("safetyNetRows counts bodies per umbrella from org rows", () => {
  const umbrellas = { LGA: { name: "Local Government Association code", nolan: n("yyyyyyy") }, DfE: { name: "DfE code", nolan: n("yyyyyny") } };
  const rows = [["1", "A council", "Council", "LGA"], ["2", "B council", "Council", "LGA"], ["3", "A school", "Education", "DfE"], ["4", "Body", "Other", ""]];
  const out = A.safetyNetRows(umbrellas, rows, []);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "LGA"); assert.equal(out[0].bodies, 2); assert.equal(out[0].allSeven, true);
  assert.equal(out[1].allSeven, false);
});

test("safetyNetRows: scrape-wins — own-coded bodies are subtracted from their umbrella", () => {
  const umbrellas = { LGA: { name: "LGA code", nolan: n("yyyyyyy") } };
  const rows = [["1", "A council", "Council", "LGA"], ["2", "B council", "Council", "LGA"], ["3", "C council", "Council", "LGA"]];
  const ownOrgs = [{ id: "2", umbrella: "LGA" }]; // body 2 has its own code read; its own code wins
  const out = A.safetyNetRows(umbrellas, rows, ownOrgs);
  assert.equal(out[0].bodies, 2);
});

test("real data: per-umbrella covered counts sum to coverage.shared", () => {
  const raw = require(path.join(__dirname, "../../static/eic/data-meta.json"));
  const rows = require(path.join(__dirname, "../../static/eic/data-orgs.json"));
  const out = A.safetyNetRows(raw.umbrellas, rows, raw.meta.ownOrgs);
  assert.equal(out.reduce((a, r) => a + r.bodies, 0), raw.meta.coverage.shared);
});

test("real data: hero numbers reconcile with data-meta.json", () => {
  const raw = require(path.join(__dirname, "../../static/eic/data-meta.json"));
  const h = A.heroNumbers({ total: raw.meta.total, coverage: raw.meta.coverage });
  assert.equal(h.reconciles, true, `total ${h.total} != ${h.shared}+${h.own}+${h.tocheck}`);
});
