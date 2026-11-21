Review observability. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Load `observability-rules` and `structured-logging`. Check [OpenTelemetry](../../development/opentelemetry.md), [Error handling](../../overview/architecture/error-handling.md), [Deployed Error Investigation](../../operations/deployed-error-investigation.md), and [Analytics pipeline](../../overview/architecture/analytics-pipeline.md) against Sentry capture, structured logs, analytics events, queue metrics, workflow summaries, and diagnostics.
- Prefer changes that make production failures easier to triage without leaking secrets or noisy user data, using existing logging, analytics, and error-handling conventions.
