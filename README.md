# AmazonHelp AI Support Agent (Node.js)

Take-home assignment: an AI customer-support agent for **AmazonHelp**
(selected automatically from the Customer Support on Twitter dataset - see
`reports/REPORT.md` section 4 and `reports/brand_selection.md`).

Given a customer message, the system: classifies its intent, retrieves
similar historical support cases, decides AUTO_HANDLE vs ESCALATE with an
explicit reason, and generates a grounded reply.

Plain Node.js, **zero runtime dependencies** - `npm install` has nothing
to install. TF-IDF, Naive Bayes, and a softmax-regression classifier are
all implemented from scratch in `src/` (there's no scikit-learn
equivalent on npm worth pulling in for a project this size, and the build
environment this was developed in had no network access to install
packages anyway - see Limitations).

## Requirements

- Node.js 18+ (uses the built-in `node:test` runner)
- No external services required to reproduce the reported results
- Optional: `ANTHROPIC_API_KEY` for LLM-generated replies and the
  LLM-judge evaluation. Not required for the core pipeline.

## Installation

```bash
npm install
```
(installs nothing - `package.json` has no dependencies - this just
confirms your Node version is compatible.)

## Environment variables

Copy `.env.example` to `.env`, fill in if you want the optional LLM
features, then export it into your shell before running scripts (this
project has no dotenv dependency by design):

```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
```

`ANTHROPIC_API_KEY` - optional. Without it, replies are generated with a
deterministic extractive method (grounded in the single most similar
historical reply). This is what all the numbers in `reports/REPORT.md`
are based on, since the build environment had no network access to
actually call an LLM API.

## Dataset location

Place the raw CSV at `data/raw/twcs_sample.csv`. See `data/README.md` for
the expected schema.

## Running the pipeline

Run in order from the project root:

```bash
node scripts/01_brandSelection.js         # analyze all brands, pick one
node scripts/02_preprocess.js             # clean + reconstruct pairs for the selected brand
node scripts/03_buildIntents.js           # apply the intent rule-set
node scripts/04_trainClassifier.js        # train + evaluate 2 baselines + main classifier
node scripts/05_buildRetrievalIndex.js    # build the TF-IDF retrieval index (train split only)
node scripts/06_buildGoldenSet.js         # sample 150-250 examples from the held-out test split
node scripts/07_runEvaluation.js          # run the full pipeline over the golden set
node scripts/08_runLlmJudge.js            # LLM-judge reply quality (PENDING without an API key)
node scripts/09a_buildHumanReviewTemplate.js
node scripts/09b_humanAgreement.js        # PENDING until the template above is hand-rated
node scripts/10_failureAnalysis.js        # extract real top-5 failure cases
```

Or, equivalently:

```bash
npm run pipeline
```

All of this takes well under 15 minutes (the classifier is the slowest
step - mini-batch gradient descent over ~11k documents, well under a
minute; most of the remaining time is CSV I/O over the 300k-row raw file,
parsed a couple of times).

### Inference / example command

```bash
node scripts/demo.js
# or with your own message:
node scripts/demo.js "my package still hasn't arrived, tracking shows nothing"
```

### Tests

```bash
npm test
# or directly:
node --test tests/**/*.test.js
```

27 tests covering preprocessing/thread reconstruction, intent rules,
TF-IDF/retrieval, escalation policy, and golden-set label derivation.

## Expected outputs

- `data/processed/` - cleaned data, trained model artifacts (JSON), retrieval index
- `evaluation/metrics.json` - classifier metrics (both baselines + main)
- `evaluation/confusion_matrix_main.csv`
- `evaluation/golden_set.csv` - the 150-250 example golden evaluation set
- `evaluation/golden_eval_results.csv` / `golden_eval_metrics.json` - full pipeline run over the golden set
- `evaluation/llm_judge_results.json` - PENDING unless `ANTHROPIC_API_KEY` is set
- `evaluation/human_review_template.csv` / `human_agreement.json` - PENDING until manually rated
- `evaluation/failure_cases.json` - real top failure examples
- `reports/REPORT.md` - the submission report
- `reports/brand_selection.md` - brand-selection analysis

## Project structure

```
data/
  raw/twcs_sample.csv          # input (you provide)
  processed/                   # generated artifacts, see data/README.md
  README.md
src/
  csv.js                       # dependency-free CSV parse/stringify
  preprocess.js                # cleaning + thread reconstruction + language heuristic
  intents.js                   # intent taxonomy + keyword rule labeler
  tfidf.js                     # TF-IDF vectorizer (word + char n-grams), from scratch
  rng.js                       # seeded PRNG for reproducible splits/sampling
  classifier.js                # majority / Naive Bayes / softmax regression, from scratch
  retrieval.js                 # TF-IDF retrieval index
  escalation.js                # rule-based escalation policy
  reply_generation.js          # extractive fallback + optional Anthropic API call
  pipeline.js                  # ties the above together (SupportAgent)
scripts/
  01_brandSelection.js ... 10_failureAnalysis.js   # pipeline stages, run in order
  demo.js                      # inference example
evaluation/                    # golden set + all evaluation outputs
reports/
  REPORT.md                    # submission report
  brand_selection.md
tests/                         # unit tests (node:test) for the critical logic
package.json
.env.example
```

## Architecture (short version)

Everything is a local, file-based pipeline: plain JS objects serialized as
JSON, a hand-rolled sparse TF-IDF implementation, no vector database, no
agent framework, no microservices, no npm dependencies at all. This is
intentional - the dataset and task don't need anything heavier, nothing
here needs to be pip/npm-installed to run, and it's something I can fully
explain and defend line by line.

## Limitations

See `reports/REPORT.md` section 14 for the full list. The ones that matter
most:

1. **Intent labels are heuristic, not human-verified.** All reported
   classifier and golden-set accuracy numbers are measured against a
   documented keyword rule-set, not human annotation. A real submission
   needs the human-review pass in `evaluation/human_review_template.csv`
   filled in.
2. **No ML libraries were available**, so the classifiers (TF-IDF,
   multinomial Naive Bayes, softmax regression) are hand-implemented in
   plain JS rather than using a battle-tested library. They're
   deliberately simple and were checked against the expected qualitative
   behavior (e.g. class-balanced training so minority intents aren't
   always predicted as the majority class), but haven't been validated
   against a reference implementation's numbers.
3. **LLM reply generation and LLM-judge evaluation were never actually
   run** in this build environment (no network access, `npm install` and
   any external API call both fail here). The code is implemented and
   ready to run with `ANTHROPIC_API_KEY` set; everything currently marked
   "PENDING" reflects that, not a fabricated result.
