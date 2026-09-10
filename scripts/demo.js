#!/usr/bin/env node
"use strict";
/**
 * Run the full pipeline on a few example customer messages and print the
 * result. This is the "inference/example command" from the README.
 *
 * Run: node scripts/demo.js
 * Run with your own message: node scripts/demo.js "my package never arrived"
 */
const { SupportAgent } = require("../src/pipeline");

const EXAMPLES = [
  "my order still hasn't arrived and it's been 2 weeks",
  "you charged my card twice for the same order, please fix this",
  "I can't log into my account, it says locked",
  "thanks, that solved it!",
];

async function main() {
  const agent = new SupportAgent();
  const messages = process.argv.length > 2 ? process.argv.slice(2) : EXAMPLES;
  for (const msg of messages) {
    const result = await agent.handle(msg);
    console.log("=".repeat(70));
    console.log(`Customer: ${result.customerMessage}`);
    console.log(`Intent: ${result.predictedIntent} (confidence=${result.classifierConfidence.toFixed(2)})`);
    console.log(`Decision: ${result.escalation.decision} - ${result.escalation.reason}`);
    console.log(`Reply (${result.reply.method}): ${result.reply.reply}`);
  }
}

main();
