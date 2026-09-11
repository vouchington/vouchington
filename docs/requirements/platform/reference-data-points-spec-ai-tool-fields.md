# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## AI Tool Fields

| Field          | Type                                                                  | Required | Description                                                    |
| -------------- | --------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| Tool name      | Topic autocomplete                                                    | Yes      | Links to an AI tool topic.                                     |
| Use case       | Enum: coding / writing / research / image-gen / data-analysis / other | Yes      | Primary use case for this tool.                                |
| Usage duration | Duration (months)                                                     | Yes      | How long the user has been using this tool.                    |
| Switched from  | Topic autocomplete                                                    | No       | Previous tool the user migrated from.                          |
| Switched to    | Topic autocomplete                                                    | No       | Tool the user migrated to (if they've stopped using this one). |
| Rating         | Number (1-5)                                                          | Yes      | Overall satisfaction rating.                                   |

## Aggregation Views

Each topic with sufficient data points displays aggregate dashboards.

### Credit Card Aggregations

- **Approval rate**: Percentage of data points with result = approved, filterable by credit score range.
- **Credit score distribution**: Histogram of reported credit score ranges for approved applicants.
- **Approval trend**: Approval rate over time (monthly buckets).
- **Average credit limit**: Mean and median approved credit limits, by score range.
- **Sample size**: Total data points and breakdown by result type.

### Hardware Aggregations

- **Failure rate**: Percentage of data points reporting failure, by ownership duration cohort.
- **Longevity curve**: Failure rate over time (cumulative).
- **Real-world performance**: Distribution of user-reported metrics.
- **Recommendation rate**: Percentage of "would recommend" responses.
- **Price distribution**: Purchase price histogram.

### AI Tool Aggregations

- **Switch patterns**: Sankey diagram showing migration flows between tools.
- **Usage duration distribution**: How long users stick with a tool before switching.
- **Use case breakdown**: Rating distributions segmented by use case.
- **Rating distribution**: Histogram of ratings.
