#!/usr/bin/env node
"use strict";
/**
 * Build the human-review CSV template (30-50 examples) for manually rating
 * generated replies. Ratings are left BLANK - fill in by hand.
 *
 * Run: node scripts/09a_buildHumanReviewTemplate.js
 * Output: evaluation/human_review_template.csv
 */
const fs = require("fs");
const path = require("path");
const { parseCSV, toCSV } = require("../src/csv");
const { mulberry32, sample } = require("../src/rng");

const SEED = 42;
const N = 40;
const RESULTS_CSV = path.join(process.cwd(), "evaluation/golden_eval_results.csv");
const OUT_CSV = path.join(process.cwd(), "evaluation/human_review_template.csv");

function main() {
  const results = parseCSV(fs.readFileSync(RESULTS_CSV, "utf8"));
  const rng = mulberry32(SEED);
  const picked = sample(results, Math.min(N, results.length), rng);

  const template = picked.map((r) => ({
    id: r.id,
    customer_message: r.customer_message,
    predicted_intent: r.predicted_intent,
    system_decision: r.predicted_decision,
    generated_reply: r.reply,
    human_intent_correct_1_5: "",
    human_escalation_appropriate_1_5: "",
    human_reply_helpfulness_1_5: "",
    human_reply_has_hallucination_yes_no: "",
    human_notes: "",
  }));

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, toCSV(template));
  console.log(`Wrote ${template.length}-row template to ${OUT_CSV}. Ratings columns are blank - PENDING manual review.`);
}

main();
