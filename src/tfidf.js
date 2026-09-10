"use strict";
/**
 * Minimal TF-IDF vectorizer, dependency-free (no scikit-learn equivalent
 * exists in plain Node, so this reimplements the parts we need: word
 * n-grams, char_wb n-grams, min_df/max_features, smooth IDF, L2-normalized
 * output). Vectors are represented sparsely as arrays of [index, value].
 */

const WORD_RE = /[a-z0-9']+/g;

function wordNgrams(text, nMin, nMax) {
  const words = (text.toLowerCase().match(WORD_RE)) || [];
  const grams = [];
  for (let n = nMin; n <= nMax; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      grams.push(words.slice(i, i + n).join(" "));
    }
  }
  return grams;
}

function charWbNgrams(text, nMin, nMax) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const grams = [];
  for (const w of words) {
    const padded = ` ${w} `;
    for (let n = nMin; n <= nMax; n++) {
      for (let i = 0; i + n <= padded.length; i++) {
        grams.push(padded.slice(i, i + n));
      }
    }
  }
  return grams;
}

class TfidfVectorizer {
  constructor({ analyzer = "word", ngramRange = [1, 1], minDf = 1, maxFeatures = 20000 } = {}) {
    this.analyzer = analyzer;
    this.ngramRange = ngramRange;
    this.minDf = minDf;
    this.maxFeatures = maxFeatures;
    this.vocab = new Map(); // term -> index
    this.idf = [];
  }

  _tokenize(text) {
    return this.analyzer === "char_wb"
      ? charWbNgrams(text, this.ngramRange[0], this.ngramRange[1])
      : wordNgrams(text, this.ngramRange[0], this.ngramRange[1]);
  }

  fit(documents) {
    const df = new Map();
    for (const doc of documents) {
      const terms = new Set(this._tokenize(doc));
      for (const t of terms) df.set(t, (df.get(t) || 0) + 1);
    }
    let entries = [...df.entries()].filter(([, count]) => count >= this.minDf);
    entries.sort((a, b) => b[1] - a[1]);
    if (entries.length > this.maxFeatures) entries = entries.slice(0, this.maxFeatures);

    this.vocab = new Map();
    this.idf = new Array(entries.length);
    const N = documents.length;
    entries.forEach(([term, docFreq], idx) => {
      this.vocab.set(term, idx);
      // smooth idf, matches sklearn default: ln((1+N)/(1+df)) + 1
      this.idf[idx] = Math.log((1 + N) / (1 + docFreq)) + 1;
    });
    return this;
  }

  transformOne(text) {
    const terms = this._tokenize(text);
    const counts = new Map();
    for (const t of terms) {
      const idx = this.vocab.get(t);
      if (idx === undefined) continue;
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    let vec = [];
    let normSq = 0;
    for (const [idx, tf] of counts.entries()) {
      const w = tf * this.idf[idx];
      vec.push([idx, w]);
      normSq += w * w;
    }
    const norm = Math.sqrt(normSq) || 1;
    vec = vec.map(([idx, w]) => [idx, w / norm]);
    vec.sort((a, b) => a[0] - b[0]);
    return vec;
  }

  transform(documents) {
    return documents.map((d) => this.transformOne(d));
  }

  fitTransform(documents) {
    this.fit(documents);
    return this.transform(documents);
  }

  get size() {
    return this.vocab.size;
  }

  toJSON() {
    return {
      analyzer: this.analyzer,
      ngramRange: this.ngramRange,
      minDf: this.minDf,
      maxFeatures: this.maxFeatures,
      vocab: [...this.vocab.entries()],
      idf: this.idf,
    };
  }

  static fromJSON(obj) {
    const v = new TfidfVectorizer({
      analyzer: obj.analyzer,
      ngramRange: obj.ngramRange,
      minDf: obj.minDf,
      maxFeatures: obj.maxFeatures,
    });
    v.vocab = new Map(obj.vocab);
    v.idf = obj.idf;
    return v;
  }
}

/** Cosine similarity between two sparse vectors (already L2-normalized,
 * so this is just the dot product), each sorted ascending by index. */
function sparseDot(a, b) {
  let i = 0, j = 0, sum = 0;
  while (i < a.length && j < b.length) {
    if (a[i][0] === b[j][0]) {
      sum += a[i][1] * b[j][1];
      i++; j++;
    } else if (a[i][0] < b[j][0]) {
      i++;
    } else {
      j++;
    }
  }
  return sum;
}

/** Concatenate two sparse feature vectors from independent vocabularies,
 * offsetting the second vector's indices - the "FeatureUnion" step. */
function concatSparse(vecA, vecB, offset) {
  const shifted = vecB.map(([idx, w]) => [idx + offset, w]);
  return [...vecA, ...shifted].sort((x, y) => x[0] - y[0]);
}

module.exports = { TfidfVectorizer, sparseDot, concatSparse, wordNgrams, charWbNgrams };
