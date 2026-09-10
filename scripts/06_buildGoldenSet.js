#!/usr/bin/env node
"use strict";
/**
 * Build a 150-250 example golden evaluation set, sampled from the TEST
 * split only (never seen by the classifier or in the retrieval index).
 *
 * Honesty notes (see also reports/REPORT.md):
 *   - expected_intent comes from the same heuristic rule-set used for
 *     training labels. NOT a human label.
 *   - expected_resolution is the REAL historical agent reply (genuine
 *     ground truth of what actually happened).
 *   - should_escalate is derived from a simple, documented, independent
 *     rule (see deriveShouldEscalate below) - also heuristic, not a human
 *     judgement.
 *
 * Run: node scripts/06_buildGoldenSet.js
 * Output: evaluation/golden_set.csv
 */
const fs = require("fs");
const path = require("path");
const { parseCSV, toCSV } = require("../src/csv");
const { mulberry32, shuffle } = require("../src/rng");

const SEED = 42;
const N_TARGET = 200;
const LABELED_CSV = path.join(process.cwd(), "data/processed/labeled_pairs.csv");
const SPLITS_JSON = path.join(process.cwd(), "data/processed/splits.json");
const OUT_CSV = path.join(process.cwd(), "evaluation/golden_set.csv");

const HIGH_RISK_INTENTS = new Set(["account_access", "payment_billing"]);
const HUMAN_HANDOFF_RE = /\b(private message|direct message|\bDM\b|call us|phone|email us at|please contact|we.?ll (follow up|be in touch)|escalat)\b/i;

function deriveShouldEscalate(intent, agentText) {
  if (HIGH_RISK_INTENTS.has(intent)) return true;
  if (intent === "other_unclear") return true;
  if (HUMAN_HANDOFF_RE.test(agentText)) return true;
  return false;
}

function main() {
  const rows = parseCSV(fs.readFileSync(LABELED_CSV, "utf8"));
  const splits = JSON.parse(fs.readFileSync(SPLITS_JSON, "utf8"));
  const testIds = new Set(splits.test_pair_ids);
  const testRows = rows.filter((r) => testIds.has(r.pair_id));

  const byIntent = new Map();
  for (const r of testRows) {
    if (!byIntent.has(r.intent)) byIntent.set(r.intent, []);
    byIntent.get(r.intent).push(r);
  }
  const perIntentCap = Math.max(15, Math.floor(N_TARGET / byIntent.size));

  const rng = mulberry32(SEED);
  let sampled = [];
  for (const [, group] of byIntent.entries()) {
    sampled.push(...shuffle(group, rng).slice(0, perIntentCap));
  }
  if (sampled.length > N_TARGET) sampled = shuffle(sampled, rng).slice(0, N_TARGET);

  const out = sampled.map((r, i) => ({
    id: `g${String(i).padStart(4, "0")}`,
    customer_message: r.customer_text,
    context: "single-turn (no multi-turn thread reconstructed - see README limitations)",
    expected_intent: r.intent,
    expected_intent_source: "heuristic_ruleset (not human-verified)",
    expected_resolution: r.agent_text,
    should_escalate: deriveShouldEscalate(r.intent, r.agent_text),
    should_escalate_source: "heuristic_rule (not human-verified)",
    notes: "auto-generated example; expected_intent and should_escalate are pending human review",
    source_pair_id: r.pair_id,
  }));

  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, toCSV(out));

  const counts = {};
  for (const r of out) counts[r.expected_intent] = (counts[r.expected_intent] || 0) + 1;
  console.log(`Wrote ${out.length} golden examples to ${OUT_CSV}`);
  console.log(counts);
}

if (require.main === module) main();

module.exports = { deriveShouldEscalate };
