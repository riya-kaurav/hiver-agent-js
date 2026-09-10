#!/usr/bin/env node
"use strict";
/**
 * Train and evaluate intent classifiers on the heuristically labeled data.
 *
 * Split by customer_id (group split) so the same customer never appears in
 * both train and test - the main leakage risk since some customers have
 * multiple similar follow-up messages in a thread.
 *
 * Models:
 *   - Baseline 1: majority-class predictor
 *   - Baseline 2: TF-IDF (word 1-2 grams) + multinomial Naive Bayes
 *   - Main:       TF-IDF (word 1-2 grams + char 3-5 grams) + multinomial
 *                 (softmax) logistic regression, trained with mini-batch
 *                 gradient descent - gives real probabilities for a
 *                 usable confidence score.
 *
 * Run: node scripts/04_trainClassifier.js
 * Output: evaluation/metrics.json
 *         evaluation/confusion_matrix_main.csv
 *         data/processed/models/*.json
 *         data/processed/splits.json
 */
const fs = require("fs");
const path = require("path");
const { parseCSV, toCSV } = require("../src/csv");
const { TfidfVectorizer, concatSparse } = require("../src/tfidf");
const { MajorityClassifier, NaiveBayesClassifier, SoftmaxRegression } = require("../src/classifier");
const { mulberry32, shuffle } = require("../src/rng");

const SEED = 42;
const IN_CSV = path.join(process.cwd(), "data/processed/labeled_pairs.csv");
const MODEL_DIR = path.join(process.cwd(), "data/processed/models");
const EVAL_DIR = path.join(process.cwd(), "evaluation");

function groupShuffleSplit(rows, groupKey, testRatio, rng) {
  const groups = [...new Set(rows.map((r) => r[groupKey]))];
  const shuffled = shuffle(groups, rng);
  const nTestGroups = Math.round(shuffled.length * testRatio);
  const testGroups = new Set(shuffled.slice(0, nTestGroups));
  const trainRows = [], testRows = [];
  for (const r of rows) {
    (testGroups.has(r[groupKey]) ? testRows : trainRows).push(r);
  }
  return [trainRows, testRows];
}

function splitData(rows) {
  const rng1 = mulberry32(SEED);
  const [train, rest] = groupShuffleSplit(rows, "customer_id", 0.30, rng1);
  const rng2 = mulberry32(SEED + 1);
  const [val, test] = groupShuffleSplit(rest, "customer_id", 0.50, rng2);

  const trainCustomers = new Set(train.map((r) => r.customer_id));
  const valCustomers = new Set(val.map((r) => r.customer_id));
  const testCustomers = new Set(test.map((r) => r.customer_id));
  for (const c of trainCustomers) {
    if (valCustomers.has(c) || testCustomers.has(c)) throw new Error("Leakage: train/val or train/test overlap");
  }
  for (const c of valCustomers) if (testCustomers.has(c)) throw new Error("Leakage: val/test overlap");

  return { train, val, test };
}

function accuracy(yTrue, yPred) {
  let correct = 0;
  for (let i = 0; i < yTrue.length; i++) if (yTrue[i] === yPred[i]) correct++;
  return correct / yTrue.length;
}

function perClassMetrics(yTrue, yPred, labels) {
  const report = {};
  const confusion = {};
  for (const l of labels) confusion[l] = {};
  for (const l of labels) for (const l2 of labels) confusion[l][l2] = 0;
  for (let i = 0; i < yTrue.length; i++) confusion[yTrue[i]][yPred[i]] += 1;

  let macroF1Sum = 0;
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
    const support = yTrue.filter((y) => y === label).length;
    report[label] = { precision, recall, f1, support };
    macroF1Sum += f1;
  }
  return { report, macroF1: macroF1Sum / labels.length, confusion };
}

function main() {
  const rows = parseCSV(fs.readFileSync(IN_CSV, "utf8"));
  const { train, val, test } = splitData(rows);
  console.log(`train=${train.length} val=${val.length} test=${test.length}`);

  const labels = [...new Set(rows.map((r) => r.intent))].sort();
  const xTrain = train.map((r) => r.customer_text);
  const yTrain = train.map((r) => r.intent);
  const xTest = test.map((r) => r.customer_text);
  const yTest = test.map((r) => r.intent);

  const results = {};

  // Baseline 1: majority class
  const majority = new MajorityClassifier().fit(yTrain);
  const predMajority = majority.predict(xTest);
  {
    const acc = accuracy(yTest, predMajority);
    const { report, macroF1, confusion } = perClassMetrics(yTest, predMajority, labels);
    results.baseline_majority_class = { name: "baseline_majority_class", accuracy: acc, macro_f1: macroF1, per_class: report };
  }

  // Baseline 2: TF-IDF (word) + Naive Bayes
  const wordVecBaseline = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 2], minDf: 2, maxFeatures: 20000 });
  const xTrainWordVecs = wordVecBaseline.fitTransform(xTrain);
  const xTestWordVecs = wordVecBaseline.transform(xTest);
  const nb = new NaiveBayesClassifier({ alpha: 1.0 }).fit(xTrainWordVecs, yTrain, wordVecBaseline.size);
  const predNb = nb.predict(xTestWordVecs);
  {
    const acc = accuracy(yTest, predNb);
    const { report, macroF1 } = perClassMetrics(yTest, predNb, labels);
    results.baseline_tfidf_naive_bayes = { name: "baseline_tfidf_naive_bayes", accuracy: acc, macro_f1: macroF1, per_class: report };
  }

  // Main: word + char TF-IDF, softmax regression
  const wordVecMain = new TfidfVectorizer({ analyzer: "word", ngramRange: [1, 2], minDf: 2, maxFeatures: 6000 });
  const charVecMain = new TfidfVectorizer({ analyzer: "char_wb", ngramRange: [3, 5], minDf: 2, maxFeatures: 6000 });
  const xTrainWord = wordVecMain.fitTransform(xTrain);
  const xTrainChar = charVecMain.fitTransform(xTrain);
  const xTrainMain = xTrainWord.map((wv, i) => concatSparse(wv, xTrainChar[i], wordVecMain.size));
  const xTestWord = wordVecMain.transform(xTest);
  const xTestChar = charVecMain.transform(xTest);
  const xTestMain = xTestWord.map((wv, i) => concatSparse(wv, xTestChar[i], wordVecMain.size));
  const vocabSizeMain = wordVecMain.size + charVecMain.size;

  console.log(`Training softmax regression (vocab=${vocabSizeMain})...`);
  const softmaxRng = mulberry32(SEED + 2);
  const softmax = new SoftmaxRegression({ lr: 0.5, epochs: 25, l2: 1e-4, batchSize: 256, seed: SEED }).fit(
    xTrainMain, yTrain, vocabSizeMain, (order) => shuffle(order, softmaxRng)
  );
  const predMain = softmax.predict(xTestMain);
  let cmMain;
  {
    const acc = accuracy(yTest, predMain);
    const { report, macroF1, confusion } = perClassMetrics(yTest, predMain, labels);
    cmMain = confusion;
    results.main_tfidf_word_char_softmax = { name: "main_tfidf_word_char_softmax", accuracy: acc, macro_f1: macroF1, per_class: report };
  }

  // save artifacts
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.writeFileSync(path.join(MODEL_DIR, "baseline_naive_bayes.json"), JSON.stringify({ vectorizer: wordVecBaseline.toJSON(), model: nb.toJSON() }));
  fs.writeFileSync(path.join(MODEL_DIR, "main_classifier.json"), JSON.stringify({
    wordVectorizer: wordVecMain.toJSON(),
    charVectorizer: charVecMain.toJSON(),
    model: softmax.toJSON(),
  }));
  fs.writeFileSync(path.join(MODEL_DIR, "labels.json"), JSON.stringify(labels));

  fs.mkdirSync(EVAL_DIR, { recursive: true });
  const cmRows = labels.map((l) => ({ label: l, ...cmMain[l] }));
  fs.writeFileSync(path.join(EVAL_DIR, "confusion_matrix_main.csv"), toCSV(cmRows, ["label", ...labels]));

  const out = {
    seed: SEED,
    split_sizes: { train: train.length, val: val.length, test: test.length },
    labels,
    leakage_check: "passed: no customer_id appears in more than one split",
    results,
  };
  fs.writeFileSync(path.join(EVAL_DIR, "metrics.json"), JSON.stringify(out, null, 2));

  fs.writeFileSync(path.join(process.cwd(), "data/processed/splits.json"), JSON.stringify({
    train_pair_ids: train.map((r) => r.pair_id),
    val_pair_ids: val.map((r) => r.pair_id),
    test_pair_ids: test.map((r) => r.pair_id),
  }));

  for (const [k, v] of Object.entries(results)) {
    console.log(`${k}: accuracy=${v.accuracy.toFixed(3)} macro_f1=${v.macro_f1.toFixed(3)}`);
  }
  console.log(`Wrote ${path.join(EVAL_DIR, "metrics.json")}, models to ${MODEL_DIR}`);
}

main();
