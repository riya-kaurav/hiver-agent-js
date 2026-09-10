#!/usr/bin/env node
"use strict";
/**
 * Run the actual end-to-end pipeline (classification + retrieval +
 * escalation + reply generation) over the golden evaluation set, and score
 * it against the (heuristic, documented-as-such) expected labels.
 *
 * Run: node scripts/07_runEvaluation.js
 * Output: evaluation/golden_eval_results.csv
 *         evaluation/golden_eval_metrics.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV, toCSV } = require("../src/csv");
const { SupportAgent } = require("../src/pipeline");

const GOLDEN_CSV = path.join(process.cwd(), "evaluation/golden_set.csv");
const OUT_RESULTS = path.join(process.cwd(), "evaluation/golden_eval_results.csv");
const OUT_METRICS = path.join(process.cwd(), "evaluation/golden_eval_metrics.json");

function accuracy(yTrue, yPred) {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) if (yTrue[i] === yPred[i]) correct++;
  return correct / yTrue.length;
}

function classificationReport(yTrue, yPred, labels) {
  const report = {};
  for (const label of labels) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
      if (yPred[i] === label && yTrue[i] === label) tp++;
      else if (yPred[i] === label && yTrue[i] !== label) fp++;
      else if (yPred[i] !== label && yTrue[i] === label) fn++;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    report[label] = { precision, recall, f1, support: yTrue.filter((y) => y === label).length };
  }
  return report;
}

function binaryPRF1(yTrue, yPred) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < yTrue.length; i++) {
    if (yPred[i] && yTrue[i]) tp++;
    else if (yPred[i] && !yTrue[i]) fp++;
    else if (!yPred[i] && yTrue[i]) fn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

async function main() {
  const golden = parseCSV(fs.readFileSync(GOLDEN_CSV, "utf8"));
  const agent = new SupportAgent();

  const rows = [];
  for (const r of golden) {
    const out = await agent.handle(r.customer_message);
    rows.push({
      id: r.id,
      customer_message: r.customer_message,
      expected_intent: r.expected_intent,
      predicted_intent: out.predictedIntent,
      classifier_confidence: out.classifierConfidence,
      intent_correct: out.predictedIntent === r.expected_intent,
      should_escalate: r.should_escalate === "true",
      predicted_decision: out.escalation.decision,
      predicted_escalate: out.escalation.decision === "ESCALATE",
      escalation_reason: out.escalation.reason,
      escalation_correct: (out.escalation.decision === "ESCALATE") === (r.should_escalate === "true"),
      top1_similarity: out.retrievedCases.length ? out.retrievedCases[0].similarity : 0,
      reply: out.reply.reply,
      reply_method: out.reply.method,
      expected_resolution: r.expected_resolution,
    });
  }

  fs.mkdirSync(path.dirname(OUT_RESULTS), { recursive: true });
  fs.writeFileSync(OUT_RESULTS, toCSV(rows));

  const labels = [...new Set(rows.map((r) => r.expected_intent))].sort();
  const intentAcc = accuracy(rows.map((r) => r.expected_intent), rows.map((r) => r.predicted_intent));
  const intentReport = classificationReport(rows.map((r) => r.expected_intent), rows.map((r) => r.predicted_intent), labels);

  const escAcc = accuracy(rows.map((r) => r.should_escalate), rows.map((r) => r.predicted_escalate));
  const escPRF1 = binaryPRF1(rows.map((r) => r.should_escalate), rows.map((r) => r.predicted_escalate));

  const metrics = {
    n_examples: rows.length,
    intent_classification: {
      accuracy: intentAcc,
      note: "scored against heuristic expected_intent labels (not human-verified)",
      report: intentReport,
    },
    escalation_decision: {
      accuracy: escAcc,
      precision_escalate: escPRF1.precision,
      recall_escalate: escPRF1.recall,
      f1_escalate: escPRF1.f1,
      note: "scored against heuristic should_escalate labels (not human-verified)",
    },
    reply_quality_llm_judge: {
      status: "PENDING",
      reason: "No ANTHROPIC_API_KEY / no network access available in the build environment. " +
              "Run scripts/08_runLlmJudge.js once an API key is available - it is fully " +
              "implemented and will populate this section, not fabricated here.",
    },
    human_agreement: {
      status: "PENDING",
      reason: "Requires human ratings in evaluation/human_review_template.csv (not filled in). " +
              "scripts/09b_humanAgreement.js computes agreement once that file has ratings.",
    },
  };
  fs.writeFileSync(OUT_METRICS, JSON.stringify(metrics, null, 2));

  console.log(`Intent accuracy (vs heuristic labels): ${intentAcc.toFixed(3)}`);
  console.log(`Escalation accuracy: ${escAcc.toFixed(3)}  precision=${escPRF1.precision.toFixed(3)} recall=${escPRF1.recall.toFixed(3)} f1=${escPRF1.f1.toFixed(3)}`);
  console.log(`Wrote ${OUT_RESULTS} and ${OUT_METRICS}`);
}

main();
