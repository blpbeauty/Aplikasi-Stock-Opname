import { test } from "node:test";
import assert from "node:assert/strict";
import { calcExpr } from "../src/components/QtyInput";

test("count formulas respect multiplication precedence and reject incomplete or invalid math", () => {
  assert.equal(calcExpr("12 × 6 + 3"), 75);
  assert.equal(calcExpr("2x12+3x6"), 42);
  assert.equal(calcExpr("5*24-3"), 117);
  assert.equal(calcExpr("0"), 0);
  assert.equal(calcExpr("12/0"), null);
  assert.equal(calcExpr("12×"), null);
  assert.equal(calcExpr("1.2.3x4"), null);
  assert.equal(calcExpr(""), null);
});
