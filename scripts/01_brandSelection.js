#!/usr/bin/env node
"use strict";
/**
 * Analyze all brands in the raw dataset and select one brand for the
 * project. Reconstructs (customer_message -> agent_reply) pairs using the
 * tweet-id reply graph, then scores each brand on volume, distinct
 * customers, and text diversity.
 *
 * Run: node scripts/01_brandSelection.js
 * Output: data/processed/brand_selection.json
 *         reports/brand_selection.md
 */
const fs = require("fs");
const path = require("path");
const { loadRaw } = require("../src/preprocess");

const OUT_JSON = path.join(process.cwd(), "data/processed/brand_selection.json");
const OUT_MD = path.join(process.cwd(), "reports/brand_selection.md");
const MIN_PAIRS = 1500;

function reconstructAllPairs(rows) {
  const customerById = new Map();
  for (const r of rows) if (r.inbound) customerById.set(r.tweet_id, r);

  const byCustomerTweet = new Map(); // customer_tweet_id -> agent row (first seen)
  for (const r of rows) {
    if (r.inbound || !r.in_response_to_tweet_id) continue;
    const custId = String(parseFloat(r.in_response_to_tweet_id));
    if (!customerById.has(custId)) continue;
    if (!byCustomerTweet.has(custId)) byCustomerTweet.set(custId, r);
  }

  const pairs = [];
  for (const [custId, agent] of byCustomerTweet.entries()) {
    const customer = customerById.get(custId);
    pairs.push({
      brand: agent.author_id,
      customer_id: customer.author_id,
      customer_text: customer.text,
    });
  }
  return pairs;
}

function scoreBrands(pairs) {
  const byBrand = new Map();
  for (const p of pairs) {
    if (!byBrand.has(p.brand)) byBrand.set(p.brand, { customers: new Set(), texts: [], lenSum: 0 });
    const b = byBrand.get(p.brand);
    b.customers.add(p.customer_id);
    b.texts.push(p.customer_text);
    b.lenSum += p.customer_text.length;
  }
  const stats = [];
  for (const [brand, b] of byBrand.entries()) {
    const uniqueTexts = new Set(b.texts).size;
    stats.push({
      brand,
      num_pairs: b.texts.length,
      num_distinct_customers: b.customers.size,
      avg_customer_text_len: b.lenSum / b.texts.length,
      unique_customer_text_ratio: uniqueTexts / b.texts.length,
    });
  }
  stats.sort((a, b) => b.num_pairs - a.num_pairs);
  return stats;
}

function main() {
  const rows = loadRaw();
  const pairs = reconstructAllPairs(rows);
  const stats = scoreBrands(pairs);

  const candidates = stats.filter((s) => s.num_pairs >= MIN_PAIRS);
  const selected = candidates[0];

  const result = {
    raw_rows: rows.length,
    total_reconstructed_pairs: pairs.length,
    min_pairs_threshold: MIN_PAIRS,
    num_candidate_brands: candidates.length,
    top_20_brands: stats.slice(0, 20),
    selected_brand: selected.brand,
    selected_brand_stats: selected,
    selection_reason:
      `'${selected.brand}' has the largest number of reconstructed customer->agent pairs ` +
      `(${selected.num_pairs}) of any brand, a large number of distinct customers, and a high ` +
      `ratio of unique customer message text, indicating diverse (non-duplicate) support issues. ` +
      `This gives enough volume for a train/eval/retrieval split without needing to combine brands.`,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  const md = [
    "# Brand Selection Analysis\n",
    `- Raw usable rows (non-empty text, deduped): ${result.raw_rows}`,
    `- Total reconstructed customer->agent pairs (all brands): ${result.total_reconstructed_pairs}`,
    `- Brands with >= ${MIN_PAIRS} pairs: ${result.num_candidate_brands}\n`,
    "## Top 20 brands by number of reconstructed pairs\n",
    "| brand | pairs | distinct customers | avg customer msg len | unique text ratio |",
    "|---|---|---|---|---|",
  ];
  for (const r of result.top_20_brands) {
    md.push(`| ${r.brand} | ${r.num_pairs} | ${r.num_distinct_customers} | ${r.avg_customer_text_len.toFixed(0)} | ${r.unique_customer_text_ratio.toFixed(2)} |`);
  }
  md.push(`\n## Selected brand: **${selected.brand}**\n`);
  md.push(result.selection_reason);
  fs.writeFileSync(OUT_MD, md.join("\n"));

  console.log(`Selected brand: ${selected.brand}`);
  console.log(`Pairs for ${selected.brand}: ${selected.num_pairs}`);
  console.log(`Wrote ${OUT_JSON} and ${OUT_MD}`);
}

main();
