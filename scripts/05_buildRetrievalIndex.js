#!/usr/bin/env node
"use strict";
/**
 * Build the retrieval index over the TRAIN split only (val/test/golden-eval
 * messages are never put into the index, so retrieval at eval time is
 * always against genuinely "historical" cases).
 *
 * Run: node scripts/05_buildRetrievalIndex.js
 * Output: data/processed/retrieval_index.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV } = require("../src/csv");
const { RetrievalIndex } = require("../src/retrieval");

const LABELED_CSV = path.join(process.cwd(), "data/processed/labeled_pairs.csv");
const SPLITS_JSON = path.join(process.cwd(), "data/processed/splits.json");

function main() {
  const rows = parseCSV(fs.readFileSync(LABELED_CSV, "utf8"));
  const splits = JSON.parse(fs.readFileSync(SPLITS_JSON, "utf8"));
  const trainIds = new Set(splits.train_pair_ids);
  const trainRows = rows.filter((r) => trainIds.has(r.pair_id));

  const index = RetrievalIndex.build(trainRows);
  index.save();
  console.log(`Built retrieval index over ${trainRows.length} historical pairs (train split only).`);

  const demo = index.query("my order still hasn't arrived and tracking shows nothing", 3);
  for (const c of demo) {
    console.log(`  sim=${c.similarity.toFixed(3)} intent=${c.intent} | ${c.customer_text.slice(0, 80)}`);
  }
}

main();
