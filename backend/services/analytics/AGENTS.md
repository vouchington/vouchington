# Analytics wrappers

- Use typed [domain wrappers](../../../docs/overview/architecture/services/analytics/README.md), never construct records directly. Define schemas at the data-store boundary and expose domain-specific arguments here.
- Architecture belongs in [the analytics pipeline](../../../docs/overview/architecture/analytics-pipeline.md); apply [data-store rules](../../data-stores/analytics/AGENTS.md).
