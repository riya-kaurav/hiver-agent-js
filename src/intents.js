"use strict";
/**
 * Brand-specific intent taxonomy for AmazonHelp, derived from manually
 * reading samples of the cleaned customer messages.
 *
 * Labels are assigned by a deterministic keyword/regex rule-set (weak
 * supervision), NOT by a human annotator or an LLM. Documented explicitly:
 * every labeled row gets `label_source: "heuristic_ruleset"`. Rules are
 * checked in order; the first match wins. No match -> "other_unclear".
 */

const INTENTS = [
  { id: "order_status_delivery", description: "Where is my order / delivery is late, missing, or tracking shows wrong status." },
  { id: "refund_return", description: "Customer wants a refund, wants to return an item, or asks about cancellation of an order." },
  { id: "damaged_defective_item", description: "Item arrived damaged, defective, wrong item, or not working as advertised." },
  { id: "account_access", description: "Can't log in, account locked/suspended, password, or account-security issue." },
  { id: "payment_billing", description: "Charged incorrectly, double charge, payment method failed, billing/invoice question." },
  { id: "app_website_technical", description: "App, website, or streaming (Prime Video/Music/Kindle) technical error or bug." },
  { id: "product_inquiry", description: "Pre-purchase or general question about a product, price, promotion, or availability." },
  { id: "general_complaint", description: "Customer is expressing frustration / complaint about service quality without one specific actionable request above." },
  { id: "other_unclear", description: "Doesn't clearly match any of the above, or is too short/ambiguous to classify." },
];
const INTENT_IDS = INTENTS.map((i) => i.id);

const RULES = [
  ["order_status_delivery", /\b(where.?s? (my|the) (order|package|parcel)|track(ing)?|deliver(y|ed|ies)?|shipp(ed|ing)|arriv(e|ed|al)|has ?n.?t (arrived|come)|out for delivery|dispatch)\b/i],
  ["refund_return", /\b(refund|return (it|this|the item)|money back|reimburse|cancel(l?ed|lation)?( my)? order)\b/i],
  ["damaged_defective_item", /\b(damaged|defective|broken|not working|doesn.?t work|faulty|wrong item|used phone|counterfeit|fake product|missing (parts|item)|item(s)? missing)\b/i],
  ["account_access", /\b(log ?in|log ?out|password|account (is )?(locked|suspended|hacked|disabled)|unlock (my )?account|can.?t access my account|verify my account)\b/i],
  ["payment_billing", /\b(charged (twice|me)|double charge|overcharged|billing|invoice|payment (failed|declined|didn.?t go through|issue)|card (was )?charged|money (was )?deducted)\b/i],
  ["app_website_technical", /\b(app (keeps? )?(crash|freez|not open)|website (is )?(down|broken|not loading)|error (code|message)|prime video|streaming|buffering|won.?t load|page not found|glitch)\b/i],
  ["product_inquiry", /\b(is there|do you (have|sell|offer)|will (you|there) be|price of|how much (is|does)|available in|promo(tion)?|discount|coupon)\b\??$|\b(price of|how much (is|does)|available in|promo(tion)?|discount code)\b/i],
  ["general_complaint", /\b(worst|terrible|pathetic|rude|disgust(ing|ed)|shame on you|awful|useless|never (order|buy)|ridiculous|unacceptable|angry|frustrat(ed|ing))\b/i],
];

function labelIntent(text) {
  for (const [intentId, pattern] of RULES) {
    if (pattern.test(text)) return intentId;
  }
  return "other_unclear";
}

module.exports = { INTENTS, INTENT_IDS, labelIntent };
