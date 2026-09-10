#!/usr/bin/env node
"use strict";
/**
 * LLM-as-judge evaluation of generated replies (auto-handled examples
 * only).
 *
 * Rubric (1-5 each unless noted):
 *   1. grounding_evidence    - is the reply supported by the retrieved cases?
 *   2. relevance              - does it address the customer's actual message?
 *   3. helpfulness
 *   4. tone
 *   5. unsupported_claims     - 1 = hallucinated a refund/policy/timeline, 5 = none
 *   6. escalation_appropriate - bool, was AUTO_HANDLE the right call here?
 *
 * NOT RUN in the build environment: this container has no network access,
 * so there is no way to actually call the Anthropic API here. This script
 * is fully implemented and will work as soon as ANTHROPIC_API_KEY is set
 * and network access is available.
 *
 * Run: ANTHROPIC_API_KEY=sk-... node scripts/08_runLlmJudge.js
 * Output: evaluation/llm_judge_results.json
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { parseCSV } = require("../src/csv");

const RESULTS_CSV = path.join(process.cwd(), "evaluation/golden_eval_results.csv");
const OUT_JSON = path.join(process.cwd(), "evaluation/llm_judge_results.json");

const JUDGE_SYSTEM_PROMPT =
  "You are grading a customer-support AI's reply. Score the reply on this " +
  "rubric, 1 (worst) to 5 (best) for each numeric field, and a boolean for " +
  "the last field. Respond with ONLY a JSON object with keys: " +
  "grounding_evidence, relevance, helpfulness, tone, unsupported_claims, " +
  "escalation_appropriate, brief_reason.";

function judgeOne(customerMessage, reply, decision, apiKey) {
  return new Promise((resolve, reject) => {
    const userPrompt =
      `Customer message: ${customerMessage}\nAI decision: ${decision}\nAI reply: ${reply}\n`;
    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const req = https.request(
      "https://api.anthropic.com/v1/messages",
      { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(body) }, timeout: 20000 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const text = (parsed.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
    fs.writeFileSync(OUT_JSON, JSON.stringify({
      status: "PENDING",
      reason: "ANTHROPIC_API_KEY not set / no network access in this environment. No judge results were fabricated.",
    }, null, 2));
    console.log("ANTHROPIC_API_KEY not set - wrote PENDING status, did not fabricate results.");
    return;
  }

  const results = parseCSV(fs.readFileSync(RESULTS_CSV, "utf8"));
  const auto = results.filter((r) => r.predicted_decision === "AUTO_HANDLE");
  const judged = [];
  for (const r of auto) {
    try {
      const score = await judgeOne(r.customer_message, r.reply, r.predicted_decision, apiKey);
      score.id = r.id;
      judged.push(score);
    } catch (e) {
      judged.push({ id: r.id, error: e.message });
    }
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify({ status: "COMPLETE", n_judged: judged.length, results: judged }, null, 2));
  console.log(`Judged ${judged.length} replies, wrote ${OUT_JSON}`);
}

main();
