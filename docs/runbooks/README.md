# Operational Runbooks

Internal procedures for high-severity safety and compliance incidents. These runbooks are staff-only
documents and are **not** surfaced in public-facing help content.

See also: [Moderation Policy Matrix](../requirements/moderation/MODERATION-POLICY-MATRIX.md)

## Runbooks

- [Native TLS Pinning](./native-tls-pinning.md) — Cloudflare edge SPKI pin rollout, rotation, and
  failure handling for native API clients.
- [Product-Safety / Recall Handling](./product-safety-recall.md) — Intake, triage, cross-functional
  contacts, and communications for product-safety and recall reports. _Forward-looking: applies as
  marketplace surfaces ship._
- [Media Delivery Reset and Restore](./media-delivery-reset-restore.md) — Coordinated PostgreSQL,
  edge-registry, and CDN-cache reset/restore workflows, prohibited partial restores, and the
  evidence required before media-delivery workers resume.
- [Media Delivery Edge Enforcement](./media-delivery-edge-enforcement.md) — Ordered two-apply
  procedure, coverage query, and checks for turning registry publication and then edge enforcement
  on in an environment.
- [Copyright Notice Operations](./copyright-notices.md) — Legal intake triage, statutory deadline
  recovery, hold handling, and incident escalation. Staffed coverage and designated-agent approval
  remain activation gates.
