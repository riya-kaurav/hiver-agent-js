"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { TfidfVectorizer, sparseDot } = require("../src/tfidf");

test("fitTransform produces L2-normalized vectors", () => {
  const vec = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 1], minDf: 1 });
  const vectors = vec.fitTransform(["order is late", "order arrived fine"]);
  for (const v of vectors) {
    const norm = Math.sqrt(v.reduce((s, [, w]) => s + w * w, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9 || v.length === 0);
  }
});

test("identical documents have similarity ~1", () => {
  const vec = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 1], minDf: 1 });
  const [a, b] = vec.fitTransform(["package never arrived", "package never arrived"]);
  assert.ok(Math.abs(sparseDot(a, b) - 1) < 1e-9);
});

test("unrelated documents have low similarity", () => {
  const vec = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 1], minDf: 1 });
  const [a, b] = vec.fitTransform(["package never arrived", "completely different unrelated topic"]);
  assert.ok(sparseDot(a, b) < 0.3);
});

test("toJSON/fromJSON roundtrip", () => {
  const vec = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 2], minDf: 1 });
  vec.fit(["order is late", "order arrived"]);
  const restored = TfidfVectorizer.fromJSON(JSON.parse(JSON.stringify(vec.toJSON())));
  const a = vec.transformOne("order is late");
  const b = restored.transformOne("order is late");
  assert.deepEqual(a, b);
});
