# Report: AmazonHelp AI Support Agent (Node.js)

## 1. Problem framing

Build an AI agent that triages inbound customer-support messages for one
brand from the Customer Support on Twitter (twcs) dataset: classify the
issue, pull up similar past cases, decide whether it's safe to auto-reply
or whether a human is needed, and draft a grounded reply when it is safe.

## 2. What "good" means

A good system here is not "always auto-handles" - it's a system that (a)
correctly identifies what a customer needs, (b) never invents a promise
(refund, timeline, account action) it can't back up with real historical
precedent, and (c) escalates the cases where being wrong is costly
(account access, money, anything it isn't confident about) even at the
cost of auto-handling less. Given (b) and (c), the two numbers that matter
most are macro-F1 on intent (not accuracy - the class distribution is
heavily skewed) and escalation **recall** (missing an escalation is worse
than an unnecessary one).

## 3. System approach

A local, file-based pipeline in **plain Node.js with zero runtime
dependencies**: clean → weak-label intents → train a classifier → build a
TF-IDF retrieval index over historical cases → rule-based escalation →
extractive (or optionally LLM) reply generation. TF-IDF, Naive Bayes, and
a softmax-regression classifier are all implemented from scratch in
`src/` - there is no scikit-learn-equivalent npm package worth adding for
a project this size, and this build environment had no network access to
install packages regardless. See `README.md` "Architecture" for the full
rationale.

## 4. Dataset and brand selection

From the 300,000-row sample, customer→agent pairs were reconstructed for
every brand using the tweet reply graph (`in_response_to_tweet_id`), then
scored by pair volume, distinct customers, and text-uniqueness ratio.
**AmazonHelp** was selected: 22,819 reconstructed pairs, 10,373 distinct
customers - by far the largest and most diverse candidate. Full analysis:
`reports/brand_selection.md`.

After filtering to AmazonHelp and cleaning (see
`data/processed/preprocess_report.json` for the exact steps), **22,374
pairs** remained; **16,501** passed a cheap English-heuristic filter (the
dataset is multilingual - Japanese, German, French, Spanish messages all
appear) and were used for intent classification.

## 5. Intent design

Nine intents, defined by reading samples of the actual cleaned messages
(not copied from another dataset): `order_status_delivery`,
`refund_return`, `damaged_defective_item`, `account_access`,
`payment_billing`, `app_website_technical`, `product_inquiry`,
`general_complaint`, `other_unclear`. Definitions: `src/intents.js`.

Labels come from a **deterministic keyword/regex rule-set**, not human
annotation or an LLM - stated explicitly everywhere the labels are used
(`label_source: heuristic_ruleset`). Real distribution over the 16,501
labeled messages:

| intent | count |
|---|---|
| other_unclear | 10,636 |
| order_status_delivery | 3,852 |
| refund_return | 723 |
| general_complaint | 542 |
| damaged_defective_item | 320 |
| account_access | 172 |
| payment_billing | 89 |
| app_website_technical | 85 |
| product_inquiry | 82 |

`other_unclear` dominates (64%) because a large share of tweets in a
support thread are short follow-ups ("Done all that.", "Thanks!") that
genuinely don't carry a self-contained intent - a property of the data,
not a labeling bug.

## 6. Two baselines

Split by `customer_id` (seeded group shuffle split, seed=42) into
train/val/test (11,438 / 2,583 / 2,480), verified with an assertion that
no customer appears in more than one split.

| model | accuracy | macro F1 |
|---|---|---|
| Baseline 1: majority class | 0.664 | 0.089 |
| Baseline 2: TF-IDF (word 1-2gram) + multinomial Naive Bayes | 0.823 | 0.254 |

Naive Bayes was chosen over logistic regression for baseline 2 because
it's simpler to implement correctly from scratch (closed-form training,
no gradient descent) - an "equally simple classical classifier" per the
assignment's own wording. Its low macro-F1 despite reasonable accuracy is
a real, useful data point: it still collapses onto the majority classes
under imbalance even with a uniform prior (see per-class numbers in
`evaluation/metrics.json`).

## 7. Main approach

TF-IDF (word 1-2gram + char 3-5gram, concatenated feature spaces) +
multinomial (softmax) logistic regression, trained with mini-batch
gradient descent and **class-balanced gradient weighting** (each sample's
gradient contribution is weighted `n / (K * n_c)`, the same idea as
scikit-learn's `class_weight="balanced"`, implemented by hand since no
such library was available). This single addition is what separates the
main model from the baseline: without it, the model reproduces the same
"always predict the majority class" failure as the Naive Bayes baseline
(verified during development - see section 11).

| model | accuracy | macro F1 |
|---|---|---|
| Main: TF-IDF (word+char) + class-balanced softmax regression | 0.808 | **0.557** |

Confusion matrix: `evaluation/confusion_matrix_main.csv`. Full metrics
including per-class precision/recall/F1: `evaluation/metrics.json`.

**Important caveat**: because both training and evaluation labels come
from the same rule-set the classifier is trained on, part of this score is
the classifier successfully approximating the same lexical rules - it is
not proof the rules themselves are semantically correct. See section 12.

## 8. Retrieval and grounding

TF-IDF cosine similarity over the **train split only** (11,438 cases) -
val/test/golden-eval messages are never in the index, so "historical
evidence" at evaluation time is always genuinely prior data. Top-k=3 by
default. Low similarity, no results, and disagreement between the top-k
cases' intents and the predicted intent are all explicit escalation
triggers (section 9). Implemented as a hand-rolled sparse vector dot
product (`src/tfidf.js`, `src/retrieval.js`) - no vector database.

## 9. Escalation policy

Rule-based, in `src/escalation.js`, thresholds configurable. Escalates on:
unclear intent, low classifier confidence (< 0.55), high-risk intent
(`account_access`, `payment_billing` - always escalated regardless of
confidence), insufficient historical evidence (top-1 similarity < 0.15),
or conflicting historical evidence (< 50% of the top-k share the
predicted intent). Output is `{decision, reason, confidence,
triggeredRules}` for every call - never a bare label.

## 10. Evaluation methodology / results

167-example golden set sampled (seed=42, capped per-intent so the
majority class doesn't dominate) from the **test split only**
(`scripts/06_buildGoldenSet.js`). `expected_intent` and `should_escalate`
are both heuristic-derived and explicitly marked as such;
`expected_resolution` is the real historical agent reply (genuine ground
truth).

Running the full pipeline (`scripts/07_runEvaluation.js`) over those 167
examples:

- **Intent accuracy vs. golden labels: 0.832**
- **Escalation decision: accuracy 0.443, precision 0.405, recall 0.969, F1 0.571**
- Confusion breakdown: 62 true-positive escalations, 2 missed escalations
  (should have escalated, didn't), 91 "unnecessary" escalations (didn't
  need to, did), 12 correct auto-handles.

Reply-quality LLM-judge and human-agreement: **PENDING** - both scripts
are fully implemented (`scripts/08_runLlmJudge.js`,
`scripts/09b_humanAgreement.js`) but this build environment had no
network access to call the Anthropic API or collect human ratings. See
section 15.

## 11. Top 5 failure modes

From `evaluation/failure_cases.json` (real pipeline output, not
invented):

1. **`low_classification_confidence` and `conflicting_historical_evidence`
   dominate escalation triggers**: of 153 predicted escalations, 104 cite
   low confidence and 105 cite conflicting evidence (many cite both). With
   9 intents and a class-balanced classifier, per-class confidence is
   naturally lower than an unbalanced model's would be - the balancing
   fix from section 7 that improved macro-F1 also makes the model less
   sure of itself, which cascades into over-escalation.
2. **Escalation precision is low (0.41)**: 91 of 167 golden-set examples
   were escalated "unnecessarily" by the (also heuristic, imperfect)
   `should_escalate` definition. This is the direct cost of prioritizing
   recall (0.97) - see section 2 on why that trade was made deliberately.
3. **Confident misclassifications cluster around messages that mix two
   real intents** - e.g. `g0082` and `g0076` are refund requests phrased
   as complaints ("throw this back in a box", "pathetic service... I
   vow to not use your app again") and get classified as
   `general_complaint` (0.54 and 0.49 confidence) instead of
   `refund_return`. The keyword rule-set itself has no way to prioritize
   "refund" over "pathetic/worst" when both appear.
4. **The 2 missed escalations (false AUTO_HANDLEs) both involve a damaged
   item or a delivery-instruction request that the retrieval index
   happened to match against an unrelated historical reply** - e.g.
   `g0052` ("worst product... not working properly") retrieved a reply
   about cassette tapes with high enough similarity to look confident.
   This is a real weakness of TF-IDF retrieval on very short, generic
   complaint text: it has almost no distinguishing vocabulary to match on.
5. **Extractive replies borrow irrelevant specifics from the matched
   historical case** (14 of 167 examples used the extractive fallback) -
   because the fallback reuses an entire historical reply verbatim rather
   than truly generating one, a reply can reference something (a
   product, a prior conversation detail) that doesn't apply to the new
   customer.

## 12. What is misleading about my headline number?

**83.2% intent accuracy on the golden set** is the number most likely to
get quoted, and it's misleading in three ways:

1. **It's measured against labels the same rule-set produced.** The
   classifier is largely learning to reproduce `src/intents.js`'s regexes
   from raw text, not learning some independently-verified notion of
   "true" customer intent. Accuracy against real human labels would
   almost certainly be lower.
2. **It says nothing about the part of the system that actually
   determines whether a real customer gets a safe experience**: the
   escalation-decision accuracy is only 44.3%, precision 40.5% - the
   system escalates more than half the time even when a human reviewer
   (using the same heuristic ground truth) would say it didn't need to.
   A high intent number and a poor escalation number can and do coexist.
3. **Macro-F1 on the classifier test set (0.557) is a full 0.25 lower
   than accuracy (0.808) would suggest** - several minority intents
   (`payment_billing`: 7 test examples, `app_website_technical`: 15,
   `product_inquiry`: 13) are learned from too little data to be reliable,
   and accuracy hides that because they're a small share of the overall
   test set.

## 13. What I would build with one more week

- Replace the keyword-based weak labeler with real human labels for at
  least the golden set (the `human_review_template.csv` infrastructure is
  ready for this), then re-measure everything against that.
- Tune the escalation thresholds against the confusion breakdown in
  section 10 - `low_classification_confidence` and
  `conflicting_historical_evidence` are firing more than intended now
  that the classifier is class-balanced (see failure mode 1); the
  original 0.55/0.5 thresholds were picked before that change.
- Add a `closing_acknowledgment` intent so "thanks!" doesn't escalate.
- Actually run `scripts/08_runLlmJudge.js` and collect real human ratings
  via `human_review_template.csv`, then report those numbers here.
- Validate the from-scratch TF-IDF/Naive Bayes/softmax-regression
  implementations against a reference library's numbers on a small known
  dataset, to rule out subtle bugs that a hand-rolled implementation can
  hide (there's no scikit-learn to cross-check against in this
  environment).
- Build true LLM-generated replies (the grounding prompt is already
  written in `src/reply_generation.js`) and compare them against the
  extractive fallback on the human-review rubric.

## 14. Limitations

- Multilingual data: non-English messages (~26% of AmazonHelp customer
  tweets) are excluded from classification/eval via a crude ASCII+stopword
  heuristic, not a real language identifier (no internet access to
  install one).
- No multi-turn thread context: each example is a single (customer
  message → agent reply) pair reconstructed from one hop of the reply
  graph, not the full conversation thread.
- Intent and escalation ground truth throughout this project are
  heuristic/rule-derived, not human-verified.
- All ML components (TF-IDF, Naive Bayes, softmax regression) are
  hand-implemented in plain JS with no external library to validate
  against, because this build environment has no network access for
  `npm install`. They were checked for qualitatively correct behavior
  (unit tests in `tests/`, sane per-class metrics) but not benchmarked
  against a reference implementation.
- Reply generation defaults to extractive reuse of a historical reply,
  which can leak irrelevant specifics from that historical case (failure
  mode 5, section 11).
- LLM-based reply generation and LLM-judge evaluation are implemented but
  never actually executed in this environment (no network/API access).

### Human Review Agreement (partial)

| Metric | Value |
|---|---|
| Rows rated | 11 / 40 |
| Avg intent_correct (1-5) | 4.00 |
| Avg escalation_appropriate (1-5) | 4.73 |
| Avg reply_helpfulness (1-5) | 3.09 |
| Hallucination rate | 9.1% (1/11) |
| Status | PARTIAL — remaining 29 rows not yet rated |