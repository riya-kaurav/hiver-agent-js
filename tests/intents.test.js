"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { labelIntent, INTENT_IDS } = require("../src/intents");

test("order status", () => {
  assert.equal(labelIntent("where is my order, tracking shows nothing"), "order_status_delivery");
});

test("refund", () => {
  assert.equal(labelIntent("I want a refund for this order"), "refund_return");
});

test("account access", () => {
  assert.equal(labelIntent("I can't log in, my account is locked"), "account_access");
});

test("payment", () => {
  assert.equal(labelIntent("you charged me twice on my card"), "payment_billing");
});

test("other/unclear default", () => {
  assert.equal(labelIntent("thanks, that solved it"), "other_unclear");
});

test("all labels valid", () => {
  for (const msg of ["where is my order", "refund please", "account locked", "random text with no signal"]) {
    assert.ok(INTENT_IDS.includes(labelIntent(msg)));
  }
});
