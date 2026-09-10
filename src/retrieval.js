"use strict";
/** Simple TF-IDF + cosine-similarity retrieval over historical customer
 * support pairs. No vector database - a sparse vector + linear scan is
 * more than enough at this scale (~11k historical cases). */
const fs = require("fs");
const path = require("path");
const { TfidfVectorizer, sparseDot } = require("./tfidf");

const DEFAULT_INDEX_PATH = path.join(process.cwd(), "data/processed/retrieval_index.json");

class RetrievalIndex {
  constructor(vectorizer, vectors, metadata) {
    this.vectorizer = vectorizer;
    this.vectors = vectors; // array of sparse vectors, one per metadata row
    this.metadata = metadata; // array of {pair_id, customer_text, agent_text, intent}
  }

  static build(rows) {
    const vectorizer = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 2], minDf: 1, maxFeatures: 30000 });
    const vectors = vectorizer.fitTransform(rows.map((r) => r.customer_text));
    const metadata = rows.map((r) => ({
      pair_id: r.pair_id,
      customer_text: r.customer_text,
      agent_text: r.agent_text,
      intent: r.intent,
    }));
    return new RetrievalIndex(vectorizer, vectors, metadata);
  }

  save(indexPath = DEFAULT_INDEX_PATH) {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify({
      vectorizer: this.vectorizer.toJSON(),
      vectors: this.vectors,
      metadata: this.metadata,
    }));
  }

  static load(indexPath = DEFAULT_INDEX_PATH) {
    const d = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    return new RetrievalIndex(TfidfVectorizer.fromJSON(d.vectorizer), d.vectors, d.metadata);
  }

  query(text, k = 5) {
    const qVec = this.vectorizer.transformOne(text);
    const sims = this.vectors.map((v) => sparseDot(qVec, v));
    const idxOrder = sims.map((s, i) => i).sort((a, b) => sims[b] - sims[a]).slice(0, k);
    return idxOrder.map((i) => ({
      pair_id: this.metadata[i].pair_id,
      customer_text: this.metadata[i].customer_text,
      agent_text: this.metadata[i].agent_text,
      intent: this.metadata[i].intent,
      similarity: sims[i],
    }));
  }
}

module.exports = { RetrievalIndex, DEFAULT_INDEX_PATH };
