"use strict";
/**
 * Generate a support reply grounded in retrieved historical cases.
 *
 * Two modes:
 *   - LLM mode: if ANTHROPIC_API_KEY is set, call the Anthropic API with a
 *     small, explicit prompt that only lets the model use the retrieved
 *     historical examples as evidence, and instructs it not to invent
 *     refunds/compensation/policies/timelines.
 *   - Fallback mode (default, no network/API key required so the project
 *     always runs end to end): adapt the single most similar retrieved
 *     historical agent reply. Extractive, not generative - it never
 *     invents anything not present in a real historical reply.
 *
 * Escalated messages get a fixed, safe holding reply instead (see
 * pipeline.js).
 */
const https = require("https");

const SYSTEM_PROMPT =
  "You are a customer support reply assistant for an e-commerce brand. " +
  "You are given the customer's message, its predicted intent, and 1-3 " +
  "similar historical (message, agent reply) pairs. Write ONE short reply " +
  "(2-3 sentences) to the CURRENT customer, in the same tone as the " +
  "historical replies. " +
  "Rules: " +
  "1) Only reference actions/information that appear in the historical replies. " +
  "2) Never promise a refund, compensation, a specific timeline, or any " +
  "account action unless a historical reply already did the same for a " +
  "similar issue. " +
  "3) Do not invent policies. " +
  "4) If the historical replies don't give enough to answer confidently, " +
  "write a reply asking the customer for the specific detail needed (e.g. " +
  "order number) instead of guessing.";

const AGENT_TAG_RE = /\s*\^[A-Z]{1,3}\s*$/;

function cleanHistoricalReply(text) {
  return text.replace(AGENT_TAG_RE, "").trim();
}

function generateFallbackReply(customerText, intent, retrievedCases) {
  if (!retrievedCases || retrievedCases.length === 0) {
    return {
      reply: "Thanks for reaching out. Could you share a bit more detail (e.g. your order number) so we can look into this?",
      method: "fallback_no_evidence",
      groundedOnPairIds: [],
    };
  }
  const best = retrievedCases[0];
  return {
    reply: cleanHistoricalReply(best.agent_text),
    method: "fallback_extractive_top1",
    groundedOnPairIds: retrievedCases.map((c) => c.pair_id),
  };
}

function generateLlmReply(customerText, intent, retrievedCases) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return reject(new Error("NoApiKey"));

    const examples = retrievedCases
      .map(
        (c) =>
          `- similar past message: "${c.customer_text}"\n  agent replied: "${cleanHistoricalReply(c.agent_text)}"\n  similarity: ${c.similarity.toFixed(2)}`
      )
      .join("\n");
    const userPrompt =
      `Current customer message: "${customerText}"\n` +
      `Predicted intent: ${intent}\n\n` +
      `Similar historical cases:\n${examples}\n\n` +
      `Write the reply now.`;

    const body = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const req = https.request(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message || "AnthropicApiError"));
            const text = (parsed.content || [])
              .filter((b) => b.type === "text")
              .map((b) => b.text)
              .join("")
              .trim();
            resolve({
              reply: text,
              method: "llm_grounded",
              groundedOnPairIds: retrievedCases.map((c) => c.pair_id),
            });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.write(body);
    req.end();
  });
}

async function generateReply(customerText, intent, retrievedCases) {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await generateLlmReply(customerText, intent, retrievedCases);
    } catch (e) {
      const fallback = generateFallbackReply(customerText, intent, retrievedCases);
      fallback.method = `fallback_after_llm_error:${e.constructor.name}`;
      return fallback;
    }
  }
  return generateFallbackReply(customerText, intent, retrievedCases);
}

module.exports = { generateReply, generateFallbackReply, generateLlmReply, cleanHistoricalReply };
