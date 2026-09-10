# Data

## Input

Place the raw Customer Support on Twitter CSV at:

```
data/raw/twcs_sample.csv
```

Expected columns: `tweet_id, author_id, inbound, created_at, text, response_tweet_id, in_response_to_tweet_id`.
This project was built and evaluated against a 300,000-row sample of the
dataset. A larger or smaller sample will still work, but brand-selection
counts and split sizes reported in `reports/REPORT.md` were computed on
that specific 300k-row file.

## Generated (by the pipeline scripts, not checked in)

```
data/processed/
  brand_selection.json       # from scripts/01_brandSelection.js
  pairs.csv                  # from scripts/02_preprocess.js
  preprocess_report.json
  labeled_pairs.csv          # from scripts/03_buildIntents.js
  intent_distribution.json
  splits.json                # train/val/test pair_id assignment, from scripts/04
  models/
    baseline_naive_bayes.json
    main_classifier.json
    labels.json
  retrieval_index.json       # from scripts/05_buildRetrievalIndex.js
```

Run `scripts/01` through `scripts/10` in order (see the root README, or
`npm run pipeline`) to regenerate all of the above plus everything in
`evaluation/`.
