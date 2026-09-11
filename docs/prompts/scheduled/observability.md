Review observability. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [OpenTelemetry](../../../docs/development/opentelemetry.md), [Error handling](../../../docs/overview/architecture/error-handling.md), [Deployed Error Investigation](../../../docs/operations/deployed-error-investigation.md), and [Analytics pipeline](../../../docs/overview/architecture/analytics-pipeline.md) against Sentry capture, structured logs, analytics events, queue metrics, workflow summaries, and operational diagnostics.
- Prefer improvements that make production failures easier to triage without leaking secrets or noisy user data.
- Ensure new telemetry uses existing logging, analytics, and error-handling conventions.
- Add or tighten tests for the selected telemetry, event, or error-handling behavior.
