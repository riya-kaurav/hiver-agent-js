#!/usr/bin/env node
"use strict";
/**
 * Compute agreement between the system's own outputs and human ratings,
 * once evaluation/human_review_template.csv has been filled in by hand.
 * If the rating columns are still empty, writes a PENDING status rather
 * than fabricating numbers.
 *
 * Run: node scripts/09b_humanAgreement.js
 * Output: evaluation/human_agreement.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV } = require("../src/csv");

const IN_CSV = path.join(process.cwd(), "evaluation/human_review_template.csv");
const OUT_JSON = path.join(process.cwd(), "evaluation/human_agreement.json");

const RATING_COLS = [
  "human_intent_correct_1_5",
  "human_escalation_appropriate_1_5",
  "human_reply_helpfulness_1_5",
  "human_reply_has_hallucination_yes_no",
];

function mean(nums) {
  const valid = nums.filter((n) => !Number.isNaN(n));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : NaN;
}

function main() {
  const rows = parseCSV(fs.readFileSync(IN_CSV, "utf8"));
  const filled = rows.filter((r) => RATING_COLS.every((c) => r[c] && r[c].trim() !== ""));

  if (filled.length === 0) {
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      status: "PENDING",
      reason: "No rows in human_review_template.csv have been rated yet.",
      n_total_rows: rows.length,
    }, null, 2));
    console.log("No human ratings found yet - wrote PENDING status.");
    return;
  }

  const summary = {
    status: filled.length < rows.length ? "PARTIAL" : "COMPLETE",
    n_rated: filled.length,
    n_total_rows: rows.length,
    avg_intent_correct_1_5: mean(filled.map((r) => parseFloat(r.human_intent_correct_1_5))),
    avg_escalation_appropriate_1_5: mean(filled.map((r) => parseFloat(r.human_escalation_appropriate_1_5))),
    avg_reply_helpfulness_1_5: mean(filled.map((r) => parseFloat(r.human_reply_helpfulness_1_5))),
    hallucination_rate: mean(filled.map((r) => (r.human_reply_has_hallucination_yes_no.toLowerCase() === "yes" ? 1 : 0))),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
