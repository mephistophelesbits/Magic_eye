import { test } from "node:test";
import assert from "node:assert/strict";
import { clamp } from "../decoder.js";

test("clamp bounds a value to [a,b]", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});
