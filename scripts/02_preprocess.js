#!/usr/bin/env node
"use strict";
/**
 * Filter the raw dataset down to the selected brand and reconstruct clean
 * customer -> agent pairs.
 *
 * Run: node scripts/02_preprocess.js
 * Output: data/processed/pairs.csv
 *         data/processed/preprocess_report.json
 */
const fs = require("fs");
const path = require("path");
const { loadRaw, reconstructBrandPairs } = require("../src/preprocess");
const { toCSV } = require("../src/csv");

const BRAND = "AmazonHelp";
const OUT_CSV = path.join(process.cwd(), "data/processed/pairs.csv");
const OUT_REPORT = path.join(process.cwd(), "data/processed/preprocess_report.json");

function main() {
  const rows = loadRaw();
  const pairs = reconstructBrandPairs(rows, BRAND);

  const report = {
    brand: BRAND,
    raw_rows_loaded: rows.length,
    final_pair_count: pairs.length,
    distinct_customers: new Set(pairs.map((p) => p.customer_id)).size,
    steps: [
      "dropped rows with missing/empty text",
      "dropped exact duplicate tweet_id rows",
      `kept only agent replies authored by ${BRAND}`,
      "joined each agent reply to the customer tweet it replies to, via in_response_to_tweet_id",
      "removed @mentions and URLs from text",
      "dropped pairs with customer or agent text < 5 chars after cleaning",
      "kept first agent reply per customer tweet when duplicates existed",
      "dropped duplicate customer message text (near-spam repeats)",
    ],
  };

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, toCSV(pairs));
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2));

  console.log(`Final pairs: ${pairs.length} for brand ${BRAND}`);
  console.log(`Wrote ${OUT_CSV}`);
}

main();
