# Trust System reference

[Back to Trust System](trust-system.md)

## Contribution Gating

Trust starts before the first contribution. New accounts face gating to raise the cost of abuse.

### Gating Tiers

| Tier                 | Rule                                                                                       | Rationale                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Time-based**       | Free accounts have a 7-day wait before submitting data points or reviews                   | Forces bots to maintain accounts for a week before they can act           |
| **Payment-based**    | Paid Plus accounts bypass the 7-day wait and get immediate contribution access             | Real humans willing to pay are unlikely to be bots; also a revenue signal |
| **Reputation-based** | First N contributions from new accounts are held for review before appearing in aggregates | Catches spam and low-quality data early, before it pollutes aggregates    |

### Interaction Between Gating and Trust

- During the gating period, contributions are recorded but not included in aggregates.
- After the gating period, contributions are retroactively included with appropriate trust weight.
- Gating parameters (duration, N for review) can be adjusted based on abuse patterns.
