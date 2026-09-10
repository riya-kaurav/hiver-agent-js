"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanText, isProbablyEnglish, reconstructBrandPairs } = require("../src/preprocess");

test("cleanText strips mentions and URLs, collapses whitespace", () => {
  const out = cleanText("@BrandHelp check https://example.com/order please  fix");
  assert.ok(!out.includes("@"));
  assert.ok(!out.includes("http"));
  assert.ok(!out.includes("  "));
});

test("isProbablyEnglish", () => {
  assert.equal(isProbablyEnglish("I have not received my order, please help"), true);
  assert.equal(isProbablyEnglish("Tengo dos cargos a la tarjeta"), false);
});

test("reconstructBrandPairs basic case", () => {
  const rows = [
    { tweet_id: "1", author_id: "Cust1", inbound: true, text: "my order is late", in_response_to_tweet_id: "", created_at: "t1" },
    { tweet_id: "2", author_id: "BrandX", inbound: false, text: "sorry about that, we will help", in_response_to_tweet_id: "1.0", created_at: "t2" },
    { tweet_id: "3", author_id: "OtherBrand", inbound: false, text: "unrelated reply", in_response_to_tweet_id: "1.0", created_at: "t3" },
  ];
  const pairs = reconstructBrandPairs(rows, "BrandX");
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].customer_text, "my order is late");
  assert.ok(pairs[0].agent_text.includes("help"));
});

test("reconstructBrandPairs ignores unmatched reply", () => {
  const rows = [
    { tweet_id: "2", author_id: "BrandX", inbound: false, text: "reply to nothing", in_response_to_tweet_id: "999.0", created_at: "t2" },
  ];
  const pairs = reconstructBrandPairs(rows, "BrandX");
  assert.equal(pairs.length, 0);
});
