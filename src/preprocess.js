"use strict";
/**
 * Shared preprocessing utilities: loading the raw twcs CSV, reconstructing
 * brand-specific customer -> agent pairs from the tweet reply graph, and
 * light text cleaning. Mirrors the logic used for brand selection so both
 * stages agree on what counts as a usable pair.
 */
const fs = require("fs");
const path = require("path");
const { parseCSV } = require("./csv");

const RAW_PATH = path.join(process.cwd(), "data/raw/twcs_sample.csv");

const MENTION_RE = /@\w+/g;
const URL_RE = /https?:\/\/\S+/g;
const WS_RE = /\s+/g;

function cleanText(text) {
  return text.replace(MENTION_RE, " ").replace(URL_RE, " ").replace(WS_RE, " ").trim();
}

const EN_STOPWORDS = new Set([
  "the", "i", "to", "you", "a", "is", "and", "my", "for", "it", "in", "of",
  "this", "have", "on", "your", "me", "not", "was", "with", "we", "that",
  "please", "can", "are", "be", "still", "just", "no", "will", "do",
]);

/**
 * Cheap heuristic (no internet access for a real language-id library):
 * ASCII-heavy text containing at least two common English function words.
 * Routes obviously non-English text (German/French/Spanish appear in this
 * dataset) away from the English intent taxonomy. Not a real classifier -
 * documented as a known limitation.
 */
function isProbablyEnglish(text) {
  if (!text) return false;
  let asciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) asciiCount++;
  }
  const asciiRatio = asciiCount / Math.max(text.length, 1);
  if (asciiRatio < 0.9) return false;
  const tokens = (text.toLowerCase().match(/[a-z']+/g)) || [];
  let hits = 0;
  for (const t of tokens) if (EN_STOPWORDS.has(t)) hits++;
  return hits >= 2;
}

function loadRaw(rawPath) {
  const text = fs.readFileSync(rawPath || RAW_PATH, "utf8");
  const rows = parseCSV(text);
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const t = (r.text || "").trim();
    if (t === "") continue;
    if (seen.has(r.tweet_id)) continue;
    seen.add(r.tweet_id);
    out.push({
      tweet_id: r.tweet_id,
      author_id: r.author_id,
      inbound: r.inbound === "True",
      created_at: r.created_at,
      text: t,
      response_tweet_id: r.response_tweet_id,
      in_response_to_tweet_id: r.in_response_to_tweet_id,
    });
  }
  return out;
}

/**
 * Reconstruct (customer_message -> agent_reply) pairs for one brand, using
 * only the explicit in_response_to_tweet_id reply graph - no guessing.
 */
function reconstructBrandPairs(rows, brand) {
  const customerById = new Map();
  for (const r of rows) {
    if (r.inbound) customerById.set(r.tweet_id, r);
  }

  const agentRows = rows.filter(
    (r) => !r.inbound && r.author_id === brand && r.in_response_to_tweet_id
  );

  // one pair per customer_tweet_id: keep first encountered (dataset rows
  // are already ordered by increasing tweet_id, which is a reasonable
  // proxy for chronological order) if duplicates exist
  const byCustomerTweet = new Map();
  for (const a of agentRows) {
    const custId = String(parseFloat(a.in_response_to_tweet_id));
    if (!customerById.has(custId)) continue;
    if (!byCustomerTweet.has(custId)) byCustomerTweet.set(custId, a);
  }

  const seenCustomerText = new Set();
  const pairs = [];
  let idx = 0;
  // iterate in a stable order (by customer tweet_id insertion in byCustomerTweet)
  for (const [custId, agent] of byCustomerTweet.entries()) {
    const customer = customerById.get(custId);
    const customerTextClean = cleanText(customer.text);
    const agentTextClean = cleanText(agent.text);
    if (customerTextClean.length < 5) continue;
    if (agentTextClean.length < 5) continue;
    if (seenCustomerText.has(customerTextClean)) continue; // drop near-spam repeats
    seenCustomerText.add(customerTextClean);

    pairs.push({
      pair_id: `p${String(idx).padStart(6, "0")}`,
      customer_tweet_id: custId,
      customer_id: customer.author_id,
      customer_text_raw: customer.text,
      agent_tweet_id: agent.tweet_id,
      agent_text_raw: agent.text,
      agent_created_at: agent.created_at,
      customer_text: customerTextClean,
      agent_text: agentTextClean,
      is_english: isProbablyEnglish(customerTextClean),
    });
    idx += 1;
  }
  return pairs;
}

module.exports = { cleanText, isProbablyEnglish, loadRaw, reconstructBrandPairs, RAW_PATH };
