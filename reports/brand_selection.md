# Brand Selection Analysis

- Raw usable rows (non-empty text, deduped): 300000
- Total reconstructed customer->agent pairs (all brands): 125194
- Brands with >= 1500 pairs: 23

## Top 20 brands by number of reconstructed pairs

| brand | pairs | distinct customers | avg customer msg len | unique text ratio |
|---|---|---|---|---|
| AmazonHelp | 22819 | 10373 | 114 | 0.99 |
| AppleSupport | 9128 | 6148 | 111 | 0.98 |
| Uber_Support | 5706 | 3887 | 119 | 0.99 |
| AmericanAir | 3749 | 2389 | 120 | 1.00 |
| SpotifyCares | 3682 | 2207 | 103 | 0.99 |
| Delta | 3585 | 2381 | 106 | 0.99 |
| British_Airways | 2921 | 1659 | 130 | 1.00 |
| TMobileHelp | 2852 | 1906 | 108 | 0.99 |
| hulu_support | 2835 | 1846 | 107 | 1.00 |
| comcastcares | 2752 | 2084 | 111 | 0.99 |
| XboxSupport | 2591 | 1613 | 107 | 0.99 |
| AskPlayStation | 2589 | 1727 | 107 | 0.99 |
| SouthwestAir | 2345 | 1707 | 112 | 1.00 |
| ChipotleTweets | 2330 | 1908 | 92 | 1.00 |
| Safaricom_Care | 1980 | 1166 | 90 | 0.98 |
| idea_cares | 1959 | 870 | 114 | 1.00 |
| Tesco | 1922 | 1131 | 120 | 1.00 |
| sprintcare | 1912 | 1278 | 105 | 1.00 |
| VerizonSupport | 1880 | 846 | 99 | 0.97 |
| VirginTrains | 1747 | 930 | 126 | 1.00 |

## Selected brand: **AmazonHelp**

'AmazonHelp' has the largest number of reconstructed customer->agent pairs (22819) of any brand, a large number of distinct customers, and a high ratio of unique customer message text, indicating diverse (non-duplicate) support issues. This gives enough volume for a train/eval/retrieval split without needing to combine brands.