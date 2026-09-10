"use strict";
/**
 * Three classifiers, all trained on sparse TF-IDF vectors from src/tfidf.js:
 *   - MajorityClassifier   : baseline 1
 *   - NaiveBayesClassifier : baseline 2 (multinomial NB over TF-IDF weights,
 *                            closed-form training, no iteration needed)
 *   - SoftmaxRegression    : main model (multinomial logistic regression,
 *                            trained with mini-batch gradient descent,
 *                            gives real probabilities for a confidence score)
 */

class MajorityClassifier {
  fit(labels) {
    const counts = new Map();
    for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
    let best = null, bestCount = -1;
    for (const [label, count] of counts.entries()) {
      if (count > bestCount) { best = label; bestCount = count; }
    }
    this.majorityLabel = best;
    this.classes = [...counts.keys()];
    return this;
  }
  predict(vectors) {
    return vectors.map(() => this.majorityLabel);
  }
  predictProba(vectors) {
    return vectors.map(() => {
      const p = {};
      for (const c of this.classes) p[c] = c === this.majorityLabel ? 1 : 0;
      return p;
    });
  }
  toJSON() { return { majorityLabel: this.majorityLabel, classes: this.classes }; }
  static fromJSON(obj) {
    const m = new MajorityClassifier();
    m.majorityLabel = obj.majorityLabel;
    m.classes = obj.classes;
    return m;
  }
}

/** Multinomial Naive Bayes over (non-negative) TF-IDF weights, treated as
 * pseudo-counts. Simple, fast, no hyperparameter search needed - a good
 * "equally simple classical classifier" alternative to logistic regression. */
class NaiveBayesClassifier {
  constructor({ alpha = 1.0 } = {}) {
    this.alpha = alpha;
  }

  fit(vectors, labels, vocabSize) {
    this.vocabSize = vocabSize;
    this.classes = [...new Set(labels)].sort();
    const classIndex = new Map(this.classes.map((c, i) => [c, i]));
    const nClasses = this.classes.length;

    const classDocCount = new Array(nClasses).fill(0);
    const classFeatureSum = Array.from({ length: nClasses }, () => new Float64Array(vocabSize));
    const classTotalWeight = new Array(nClasses).fill(0);

    for (let i = 0; i < vectors.length; i++) {
      const ci = classIndex.get(labels[i]);
      classDocCount[ci] += 1;
      for (const [idx, w] of vectors[i]) {
        classFeatureSum[ci][idx] += w;
        classTotalWeight[ci] += w;
      }
    }

    // Uniform ("balanced") prior: with heavy class imbalance (65% of the
    // data is one class), the empirical prior alone drowns out minority
    // classes entirely (they get 0 recall). A uniform prior forces the
    // decision to rest on the likelihood term instead - the standard fix
    // when a library's class_weight="balanced" option isn't available.
    this.logPrior = this.classes.map(() => Math.log(1 / nClasses));
    this.logLikelihood = classFeatureSum.map((sums, ci) => {
      const denom = classTotalWeight[ci] + this.alpha * vocabSize;
      const arr = new Float64Array(vocabSize);
      for (let j = 0; j < vocabSize; j++) {
        arr[j] = Math.log((sums[j] + this.alpha) / denom);
      }
      return arr;
    });
    return this;
  }

  _scores(vec) {
    return this.classes.map((_, ci) => {
      let score = this.logPrior[ci];
      for (const [idx, w] of vec) score += w * this.logLikelihood[ci][idx];
      return score;
    });
  }

  predictProba(vectors) {
    return vectors.map((vec) => {
      const scores = this._scores(vec);
      const max = Math.max(...scores);
      const exp = scores.map((s) => Math.exp(s - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      const probs = {};
      this.classes.forEach((c, i) => (probs[c] = exp[i] / sum));
      return probs;
    });
  }

  predict(vectors) {
    return this.predictProba(vectors).map((probs) => {
      let best = null, bestP = -1;
      for (const [c, p] of Object.entries(probs)) if (p > bestP) { best = c; bestP = p; }
      return best;
    });
  }

  toJSON() {
    return {
      alpha: this.alpha,
      vocabSize: this.vocabSize,
      classes: this.classes,
      logPrior: this.logPrior,
      logLikelihood: this.logLikelihood.map((a) => Array.from(a)),
    };
  }
  static fromJSON(obj) {
    const m = new NaiveBayesClassifier({ alpha: obj.alpha });
    m.vocabSize = obj.vocabSize;
    m.classes = obj.classes;
    m.logPrior = obj.logPrior;
    m.logLikelihood = obj.logLikelihood.map((a) => Float64Array.from(a));
    return m;
  }
}

/** Multinomial (softmax) logistic regression trained with mini-batch
 * gradient descent and L2 regularization. Deterministic given a seeded
 * shuffle order. */
class SoftmaxRegression {
  constructor({ lr = 0.5, epochs = 40, l2 = 1e-4, batchSize = 256, seed = 42 } = {}) {
    this.lr = lr;
    this.epochs = epochs;
    this.l2 = l2;
    this.batchSize = batchSize;
    this.seed = seed;
  }

  fit(vectors, labels, vocabSize, rngShuffle) {
    this.vocabSize = vocabSize;
    this.classes = [...new Set(labels)].sort();
    const classIndex = new Map(this.classes.map((c, i) => [c, i]));
    const nClasses = this.classes.length;
    const n = vectors.length;

    // class_weight="balanced" equivalent: weight = n / (K * n_c), so rare
    // classes get a proportionally larger gradient contribution. Without
    // this, minority intents (a handful of the 9 classes have <100
    // examples out of ~11k) get 0 recall - the model just always predicts
    // the dominant class.
    const classCounts = new Array(nClasses).fill(0);
    for (const l of labels) classCounts[classIndex.get(l)] += 1;
    const classWeight = classCounts.map((c) => n / (nClasses * c));

    this.weights = Array.from({ length: nClasses }, () => new Float64Array(vocabSize));
    this.bias = new Float64Array(nClasses);

    const y = labels.map((l) => classIndex.get(l));
    const sampleWeight = y.map((c) => classWeight[c]);
    let order = Array.from({ length: n }, (_, i) => i);

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      order = rngShuffle(order);
      for (let start = 0; start < n; start += this.batchSize) {
        const batchIdx = order.slice(start, start + this.batchSize);
        const gradW = Array.from({ length: nClasses }, () => new Float64Array(vocabSize));
        const gradB = new Float64Array(nClasses);
        let weightSum = 0;

        for (const i of batchIdx) {
          const vec = vectors[i];
          const sw = sampleWeight[i];
          weightSum += sw;
          const scores = new Float64Array(nClasses);
          for (let c = 0; c < nClasses; c++) {
            let s = this.bias[c];
            const w = this.weights[c];
            for (const [idx, val] of vec) s += w[idx] * val;
            scores[c] = s;
          }
          const max = Math.max(...scores);
          let sumExp = 0;
          const probs = new Float64Array(nClasses);
          for (let c = 0; c < nClasses; c++) {
            probs[c] = Math.exp(scores[c] - max);
            sumExp += probs[c];
          }
          for (let c = 0; c < nClasses; c++) probs[c] /= sumExp;

          const trueClass = y[i];
          for (let c = 0; c < nClasses; c++) {
            const err = (probs[c] - (c === trueClass ? 1 : 0)) * sw;
            gradB[c] += err;
            const gw = gradW[c];
            for (const [idx, val] of vec) gw[idx] += err * val;
          }
        }

        const norm = weightSum || 1;
        for (let c = 0; c < nClasses; c++) {
          const w = this.weights[c];
          const gw = gradW[c];
          for (let j = 0; j < vocabSize; j++) {
            const grad = gw[j] / norm + this.l2 * w[j];
            w[j] -= this.lr * grad;
          }
          this.bias[c] -= this.lr * (gradB[c] / norm);
        }
      }
    }
    return this;
  }

  _probsOne(vec) {
    const nClasses = this.classes.length;
    const scores = new Float64Array(nClasses);
    for (let c = 0; c < nClasses; c++) {
      let s = this.bias[c];
      const w = this.weights[c];
      for (const [idx, val] of vec) s += w[idx] * val;
      scores[c] = s;
    }
    const max = Math.max(...scores);
    let sumExp = 0;
    const probs = new Float64Array(nClasses);
    for (let c = 0; c < nClasses; c++) {
      probs[c] = Math.exp(scores[c] - max);
      sumExp += probs[c];
    }
    for (let c = 0; c < nClasses; c++) probs[c] /= sumExp;
    return probs;
  }

  predictProba(vectors) {
    return vectors.map((vec) => {
      const probs = this._probsOne(vec);
      const out = {};
      this.classes.forEach((c, i) => (out[c] = probs[i]));
      return out;
    });
  }

  predict(vectors) {
    return vectors.map((vec) => {
      const probs = this._probsOne(vec);
      let bestIdx = 0;
      for (let c = 1; c < probs.length; c++) if (probs[c] > probs[bestIdx]) bestIdx = c;
      return this.classes[bestIdx];
    });
  }

  toJSON() {
    return {
      lr: this.lr, epochs: this.epochs, l2: this.l2, batchSize: this.batchSize, seed: this.seed,
      vocabSize: this.vocabSize,
      classes: this.classes,
      weights: this.weights.map((w) => Array.from(w)),
      bias: Array.from(this.bias),
    };
  }
  static fromJSON(obj) {
    const m = new SoftmaxRegression({ lr: obj.lr, epochs: obj.epochs, l2: obj.l2, batchSize: obj.batchSize, seed: obj.seed });
    m.vocabSize = obj.vocabSize;
    m.classes = obj.classes;
    m.weights = obj.weights.map((w) => Float64Array.from(w));
    m.bias = Float64Array.from(obj.bias);
    return m;
  }
}

module.exports = { MajorityClassifier, NaiveBayesClassifier, SoftmaxRegression };
