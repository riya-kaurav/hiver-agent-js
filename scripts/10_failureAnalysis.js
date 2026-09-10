#!/usr/bin/env node
"use strict";
/**
 * Identify the top failure cases from the actual golden-set evaluation
 * run. Two failure types, using real results only:
 *   - intent misclassifications with HIGH classifier confidence
 *   - escalation false AUTO_HANDLEs (should have escalated but didn't)
 *
 * Run: node scripts/10_failureAnalysis.js
 * Output: evaluation/failure_cases.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV } = require("../src/csv");

const RESULTS_CSV = path.join(process.cwd(), "evaluation/golden_eval_results.csv");
const OUT_JSON = path.join(process.cwd(), "evaluation/failure_cases.json");

function main() {
  if (!fs.existsSync(RESULTS_CSV)) {
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      status: "PENDING",
      reason: "evaluation/golden_eval_results.csv not found - run scripts/07_runEvaluation.js first.",
    }, null, 2));
    console.log("No eval results found - wrote PENDING status.");
    return;
  }

  const results = parseCSV(fs.readFileSync(RESULTS_CSV, "utf8"));

  const confidentMisclassifications = results
    .filter((r) => r.intent_correct === "false")
    .sort((a, b) => parseFloat(b.classifier_confidence) - parseFloat(a.classifier_confidence))
    .slice(0, 5)
    .map((r) => ({
      id: r.id, customer_message: r.customer_message, expected_intent: r.expected_intent,
      predicted_intent: r.predicted_intent, classifier_confidence: parseFloat(r.classifier_confidence),
    }));

  const falseAutoHandles = results
    .filter((r) => r.should_escalate === "true" && r.predicted_escalate === "false")
    .sort((a, b) => parseFloat(b.classifier_confidence) - parseFloat(a.classifier_confidence))
    .slice(0, 5)
    .map((r) => ({
      id: r.id, customer_message: r.customer_message, predicted_intent: r.predicted_intent,
      predicted_decision: r.predicted_decision, reply: r.reply, expected_resolution: r.expected_resolution,
    }));

  const out = {
    status: "COMPLETE",
    note: "Derived directly from evaluation/golden_eval_results.csv - real pipeline outputs, not invented.",
    top_confident_misclassifications: confidentMisclassifications,
    top_false_auto_handles: falseAutoHandles,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT_JSON}`);
  console.log(`  confident misclassifications found: ${confidentMisclassifications.length}`);
  console.log(`  false auto-handles found: ${falseAutoHandles.length}`);
}

main();
