# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Review Structure by Vertical

Reviews extend data points with narrative content. Each vertical has structured sub-ratings and metadata.

### Common Review Fields

| Field              | Type                      | Description                                                                       |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------- |
| Sub-ratings        | Map of dimension → 1-5    | Vertical-specific dimensions (see below)                                          |
| "Best for" tags    | Tag list                  | Categorizes who benefits most (e.g., "frequent travelers", "gamers", "solo devs") |
| Duration of use    | Duration                  | How long the reviewer has used the product at time of review                      |
| Confidence level   | Enum: low / medium / high | Reviewer's self-assessed confidence in their evaluation                           |
| Would recommend    | Boolean                   | Simple recommendation signal                                                      |
| "Compared to" link | Topic reference           | What product the reviewer is implicitly comparing against                         |

### Credit Card Sub-Ratings

- Rewards value
- Annual fee value
- Sign-up bonus
- Customer service
- App/website experience
- Perks & benefits

### Hardware Sub-Ratings

- Build quality
- Performance
- Value for money
- Noise / thermals
- Software / drivers
- Longevity

### AI Tool Sub-Ratings

- Accuracy / quality
- Speed
- Ease of use
- Documentation
- Value for money
- Integration ecosystem
