# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Data Quality Rules

### Confidence Intervals

All aggregate values display confidence intervals based on sample size. Small samples show wide intervals, signaling uncertainty.

### Minimum N Thresholds

| Aggregate Type      | Minimum N | Display Before Threshold               |
| ------------------- | --------- | -------------------------------------- |
| Approval rate       | 10        | "Not enough data yet (N of 10 needed)" |
| Failure rate        | 15        | "Not enough data yet (N of 15 needed)" |
| Average values      | 5         | "Not enough data yet (N of 5 needed)"  |
| Distribution charts | 20        | "Not enough data yet (N of 20 needed)" |

### Contributor Badges

| Badge                      | Criteria                                       | Effect                                                                          |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| **Unverified contributor** | Account less than 30 days old                  | Data points visible but flagged; excluded from aggregates until account ages in |
| **Verified contributor**   | Account 30+ days old, 3+ data points submitted | Full weight in aggregates                                                       |
| **Trusted contributor**    | High trust weight from Phase 2+ trust system   | Enhanced weight in aggregates                                                   |
