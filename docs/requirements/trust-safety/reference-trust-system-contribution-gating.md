# Trust System reference

[Back to Trust System](trust-system.md)

## Contribution Gating

Trust starts before the first contribution. New accounts face gating to raise the cost of abuse.

### Gating Tiers

| Tier                 | Rule                                                                                         | Rationale                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Time-based**       | Free accounts wait before submitting data points or reviews                                  | Forces bots to maintain accounts for a while before they can act          |
| **Payment-based**    | Paid Plus accounts bypass the wait and get immediate contribution access                     | Real humans willing to pay are unlikely to be bots; also a revenue signal |
| **Reputation-based** | The first contributions from new accounts are held for review before appearing in aggregates | Catches spam and low-quality data early, before it pollutes aggregates    |

### Interaction Between Gating and Trust

- During the gating period, contributions are recorded but not included in aggregates.
- After the gating period, contributions are retroactively included with appropriate trust weight.
- Gating parameters are runtime configuration, tuned against abuse patterns.

Contribution quotas use rolling windows and stay exact: each admission counts the committed
consumption inside the policy windows. A per-user admission claim lets one contribution admission
per user run at a time, so concurrent posts by the same user cannot both pass the capacity check;
a second request receives the in-progress response with a short retry delay.
