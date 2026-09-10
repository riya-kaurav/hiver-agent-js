"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decide } = require("../src/escalation");

function c(intent, sim) {
  return { pair_id: "p", customer_text: "x", agent_text: "y", intent, similarity: sim };
}

test("unclear intent escalates", () => {
  const r = decide("other_unclear", 0.9, [c("other_unclear", 0.5)]);
  assert.equal(r.decision, "ESCALATE");
  assert.ok(r.triggeredRules.includes("unclear_intent"));
});

test("low confidence escalates", () => {
  const r = decide("order_status_delivery", 0.3, [c("order_status_delivery", 0.5)]);
  assert.equal(r.decision, "ESCALATE");
  assert.ok(r.triggeredRules.includes("low_classification_confidence"));
});

test("high risk intent always escalates", () => {
  const r = decide("account_access", 0.99, [c("account_access", 0.9)]);
  assert.equal(r.decision, "ESCALATE");
  assert.ok(r.triggeredRules.includes("sensitive_high_risk_intent"));
});

test("low similarity escalates", () => {
  const r = decide("order_status_delivery", 0.9, [c("order_status_delivery", 0.1)], { minTop1Similarity: 0.5 });
  assert.equal(r.decision, "ESCALATE");
  assert.ok(r.triggeredRules.includes("insufficient_historical_evidence"));
});

test("conflicting evidence escalates", () => {
  const cases = [c("refund_return", 0.6), c("account_access", 0.6), c("payment_billing", 0.6)];
  const r = decide("order_status_delivery", 0.9, cases);
  assert.equal(r.decision, "ESCALATE");
  assert.ok(r.triggeredRules.includes("conflicting_historical_evidence"));
});

test("confident clean case auto-handles", () => {
  const cases = [c("order_status_delivery", 0.6), c("order_status_delivery", 0.5)];
  const r = decide("order_status_delivery", 0.9, cases);
  assert.equal(r.decision, "AUTO_HANDLE");
  assert.deepEqual(r.triggeredRules, []);
});
