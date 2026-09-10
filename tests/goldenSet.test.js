"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveShouldEscalate } = require("../scripts/06_buildGoldenSet");

test("high-risk intent always should-escalate", () => {
  assert.equal(deriveShouldEscalate("account_access", "here's how to fix it"), true);
  assert.equal(deriveShouldEscalate("payment_billing", "no issue here"), true);
});

test("other_unclear should-escalate", () => {
  assert.equal(deriveShouldEscalate("other_unclear", "ok thanks"), true);
});

test("human handoff language should-escalate", () => {
  assert.equal(deriveShouldEscalate("order_status_delivery", "please send us a private message so we can help"), true);
});

test("simple resolved case should not escalate", () => {
  assert.equal(deriveShouldEscalate("order_status_delivery", "glad to hear it arrived, enjoy!"), false);
});
