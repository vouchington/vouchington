# Trust System reference

[Back to Trust System](trust-system.md)

## Phase 2 — Post-Launch: Vote Weight Calibration

Once sufficient voting data exists, introduce calibrated vote weights based on alignment with moderator assessments.

### Calibration Formula

```
vote_weight = base_weight * accuracy_multiplier
```

Where:

- `base_weight` = 1.0 (all users start equal)
- `accuracy_multiplier` = rolling average of how often the user's votes align with the eventual moderator consensus

### How It Works

1. Moderators make quality assessments on a sample of content (good, neutral, bad).
2. Users who consistently vote in alignment with moderator assessments see their `accuracy_multiplier` increase (up to a cap).
3. Users who consistently vote against moderator assessments see their `accuracy_multiplier` decrease (down to a floor, never zero).
4. The multiplier updates gradually — no sudden changes.

### Key Design Decisions

- **No explicit trust scores shown**: Users never see their trust weight or anyone else's. This prevents gaming and social pressure.
- **Gradual adjustment**: The multiplier moves slowly. A single disagreement with moderators has minimal effect.
- **Floor, not zero**: Even low-trust users retain some vote weight. Complete suppression only happens through account suspension.
- **Moderator calibration**: Moderator assessments themselves are cross-checked. No single moderator can skew the calibration set.

### What Changes in Phase 2

| Surface                | Phase 1                  | Phase 2                                     |
| ---------------------- | ------------------------ | ------------------------------------------- |
| Post ranking           | Raw vote count           | Weighted vote score                         |
| Data point aggregation | Equal weight             | Trust-weighted aggregation                  |
| Referral link ranking  | Social graph + raw votes | Social graph + weighted votes               |
| Content moderation     | Manual review            | Weighted community flagging + manual review |
