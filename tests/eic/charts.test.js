"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const C = require(path.join(__dirname, "../../static/eic/charts.js"));

test("cellColor: share 1 -> teal, 0 -> magenta, null -> grey, 0.5 -> midpoint", () => {
  assert.equal(C.cellColor(1).toLowerCase(), "#1899a2");
  assert.equal(C.cellColor(0).toLowerCase(), "#e41e7c");
  assert.equal(C.cellColor(null).toLowerCase(), "#c3cad5");
  assert.equal(C.cellColor(0.5).toLowerCase(), "#7e5c8f"); // exact RGB midpoint of the teal→magenta lerp
});

test("cellColor: out-of-range shares clamp to endpoints", () => {
  assert.equal(C.cellColor(2).toLowerCase(), "#1899a2");
  assert.equal(C.cellColor(-1).toLowerCase(), "#e41e7c");
});
