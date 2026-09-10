"use strict";
/** End-to-end pipeline: raw customer message -> intent -> retrieval ->
 * escalation decision -> reply. Used by both scripts/demo.js and the
 * evaluation scripts, so "how it runs" and "how it's evaluated" never
 * drift apart. */
const fs = require("fs");
const path = require("path");

const { cleanText } = require("./preprocess");
const { TfidfVectorizer, concatSparse } = require("./tfidf");
const { SoftmaxRegression } = require("./classifier");
const { RetrievalIndex } = require("./retrieval");
const { decide, DEFAULT_CONFIG } = require("./escalation");
const { generateReply } = require("./reply_generation");

const MODEL_DIR = path.join(process.cwd(), "data/processed/models");

class SupportAgent {
  constructor({ escalationConfig = {}, topK = 3 } = {}) {
    const bundle = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, "main_classifier.json"), "utf8"));
    this.wordVectorizer = TfidfVectorizer.fromJSON(bundle.wordVectorizer);
    this.charVectorizer = TfidfVectorizer.fromJSON(bundle.charVectorizer);
    this.model = SoftmaxRegression.fromJSON(bundle.model);
    this.retrieval = RetrievalIndex.load();
    this.escalationConfig = { ...DEFAULT_CONFIG, ...escalationConfig };
    this.topK = topK;
  }

  _featurize(text) {
    const wordVec = this.wordVectorizer.transformOne(text);
    const charVec = this.charVectorizer.transformOne(text);
    return concatSparse(wordVec, charVec, this.wordVectorizer.size);
  }

  classify(text) {
    const vec = this._featurize(text);
    const probs = this.model.predictProba([vec])[0];
    let bestLabel = null, bestP = -1;
    for (const [label, p] of Object.entries(probs)) {
      if (p > bestP) { bestLabel = label; bestP = p; }
    }
    return { intent: bestLabel, confidence: bestP };
  }

  async handle(rawText) {
    const text = cleanText(rawText);
    const { intent, confidence } = this.classify(text);
    const retrieved = this.retrieval.query(text, this.topK);
    const esc = decide(intent, confidence, retrieved, this.escalationConfig);

    let reply;
    if (esc.decision === "ESCALATE") {
      reply = {
        reply: "Thanks for reaching out - I'm looping in a member of our team who can " +
               "look into your account/order details and help resolve this.",
        method: "escalation_holding_message",
        groundedOnPairIds: [],
      };
    } else {
      reply = await generateReply(text, intent, retrieved);
    }

    return {
      customerMessage: rawText,
      cleanedMessage: text,
      predictedIntent: intent,
      classifierConfidence: confidence,
      retrievedCases: retrieved,
      escalation: esc,
      reply,
    };
  }
}

module.exports = { SupportAgent };
