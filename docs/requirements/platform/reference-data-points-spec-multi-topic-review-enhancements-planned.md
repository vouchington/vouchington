# Data Points Specification reference

[Back to Data Points Specification](data-points-spec.md)

## Multi-Topic Review Enhancements (Planned)

Multi-topic reviews (reviews with 2+ topics) directly pit two or more products against each other.

| Field                      | Type                      | Description                                                                                               |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Winner pick                | Topic reference           | Which product the reviewer considers the overall winner                                                   |
| "It depends on..."         | Structured conditions     | Conditional recommendations (e.g., "If you travel internationally, pick A; if you want cashback, pick B") |
| Dimension-level comparison | Map of dimension → winner | Per-dimension winner picks for granular comparison                                                        |

Multi-topic reviews are linked to all compared products and appear on each product's topic page.

## Related

- [Currency-aware integer money contract](../../overview/architecture/monetary-values.md)
- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [docs/requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md](../users/ACCOUNT-DELETION-DATA-REQUEST.md)
