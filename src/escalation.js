"use strict";
/** Rule-based, explainable escalation policy. All thresholds are
 * configurable. Mirrors src/escalation.py exactly. */

const HIGH_RISK_INTENTS = new Set(["account_access", "payment_billing"]);

const DEFAULT_CONFIG = {
  minClassifierConfidence: 0.55,
  minTop1Similarity: 0.15,
  minSupportingCases: 1,
  conflictingEvidenceRatio: 0.5,
};

function decide(predictedIntent, classifierConfidence, retrievedCases, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const triggered = [];

  if (predictedIntent === "other_unclear") triggered.push("unclear_intent");
  if (classifierConfidence < cfg.minClassifierConfidence) triggered.push("low_classification_confidence");
  if (HIGH_RISK_INTENTS.has(predictedIntent)) triggered.push("sensitive_high_risk_intent");

  const supporting = retrievedCases.filter((c) => c.similarity >= cfg.minTop1Similarity);
  if (supporting.length < cfg.minSupportingCases) triggered.push("insufficient_historical_evidence");

  if (retrievedCases.length > 0) {
    const agree = retrievedCases.filter((c) => c.intent === predictedIntent).length;
    if (agree / retrievedCases.length < cfg.conflictingEvidenceRatio) {
      triggered.push("conflicting_historical_evidence");
    }
  }

  if (triggered.length > 0) {
    return {
      decision: "ESCALATE",
      reason: triggered.join("; "),
      confidence: classifierConfidence,
      triggeredRules: triggered,
    };
  }
  return {
    decision: "AUTO_HANDLE",
    reason: "classifier confident, intent is low-risk, and strong consistent historical evidence found",
    confidence: classifierConfidence,
    triggeredRules: [],
  };
}

module.exports = { decide, HIGH_RISK_INTENTS, DEFAULT_CONFIG };
