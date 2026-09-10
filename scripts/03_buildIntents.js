#!/usr/bin/env node
"use strict";
/**
 * Apply the heuristic intent labeler to every English customer message and
 * save the labeled dataset plus label distribution stats.
 *
 * Run: node scripts/03_buildIntents.js
 * Output: data/processed/labeled_pairs.csv
 *         data/processed/intent_distribution.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV, toCSV } = require("../src/csv");
const { INTENTS, labelIntent } = require("../src/intents");

const IN_CSV = path.join(process.cwd(), "data/processed/pairs.csv");
const OUT_CSV = path.join(process.cwd(), "data/processed/labeled_pairs.csv");
const OUT_STATS = path.join(process.cwd(), "data/processed/intent_distribution.json");

function main() {
  const rows = parseCSV(fs.readFileSync(IN_CSV, "utf8")).filter((r) => r.is_english === "true");

  for (const r of rows) {
    r.intent = labelIntent(r.customer_text);
    r.label_source = "heuristic_ruleset";
  }

  const counts = {};
  for (const r of rows) counts[r.intent] = (counts[r.intent] || 0) + 1;

  const stats = {
    total_labeled: rows.length,
    intent_definitions: INTENTS,
    label_source:
      "heuristic_ruleset (deterministic keyword/regex rules, see src/intents.js) - NOT human-verified. Treat as weak supervision.",
    distribution: counts,
  };

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, toCSV(rows));
  fs.writeFileSync(OUT_STATS, JSON.stringify(stats, null, 2));

  console.log("Intent distribution:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  console.log(`Wrote ${OUT_CSV} and ${OUT_STATS}`);
}

main();
