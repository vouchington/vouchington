# Trust System reference

[Back to Trust System](trust-system.md)

## Phase 3 — Scale: ML-Based Trust

At scale, introduce multi-factor ML trust scoring.

### Trust Signals

| Signal                   | Weight | Description                                                                        |
| ------------------------ | ------ | ---------------------------------------------------------------------------------- |
| Vote accuracy            | High   | Alignment with calibrated consensus (from Phase 2)                                 |
| Data point verification  | High   | How often the user's data points are consistent with community aggregates          |
| Review quality           | Medium | Engagement signals on reviews: helpful votes, replies, citation by other reviewers |
| Account age              | Low    | Longer tenure = slightly higher baseline trust                                     |
| Contribution frequency   | Low    | Active contributors earn trust faster, but volume alone doesn't equal quality      |
| Cross-domain consistency | Medium | Users who are trusted in one vertical transfer some trust to new verticals         |

### Cross-Domain Trust Transfer

When a user with high trust in the credit card vertical starts contributing to the hardware vertical, they carry a portion of their trust score:

```
new_domain_trust = base_trust + (existing_trust * transfer_coefficient)
```

The transfer coefficient is less than 1.0 — expertise in one domain is a positive signal but not a guarantee of expertise in another.

### ML Model Considerations

- **Interpretability**: The trust model should be explainable. Users won't see scores, but moderators and engineers need to understand why a user's trust changed.
- **Adversarial robustness**: The model must resist coordinated manipulation. Feature engineering should include cross-account correlation detection.
- **Feedback loops**: Monitor for trust score feedback loops where high-trust users' votes reinforce each other in a closed circle.
