"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { RetrievalIndex } = require("../src/retrieval");

function toyRows() {
  return [
    { pair_id: "p0", customer_text: "my order hasn't arrived yet", agent_text: "sorry, let us check tracking", intent: "order_status_delivery" },
    { pair_id: "p1", customer_text: "I want a refund for this item", agent_text: "we can process a refund", intent: "refund_return" },
    { pair_id: "p2", customer_text: "can't log into my account", agent_text: "let's reset your password", intent: "account_access" },
  ];
}

test("query returns most similar first", () => {
  const idx = RetrievalIndex.build(toyRows());
  const results = idx.query("where is my package, it never arrived", 2);
  assert.equal(results[0].intent, "order_status_delivery");
  assert.ok(results[0].similarity >= results[1].similarity);
});

test("query k respected", () => {
  const idx = RetrievalIndex.build(toyRows());
  const results = idx.query("refund please", 1);
  assert.equal(results.length, 1);
});

test("save and load roundtrip", () => {
  const idx = RetrievalIndex.build(toyRows());
  const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "idx-")), "index.json");
  idx.save(tmpFile);
  const loaded = RetrievalIndex.load(tmpFile);
  const results = loaded.query("account locked", 1);
  assert.equal(results[0].intent, "account_access");
});
