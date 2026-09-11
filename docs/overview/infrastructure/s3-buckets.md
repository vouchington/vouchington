# S3 Buckets × Lifecycle Matrix

This document maps every S3 bucket in the Voucha OpenTofu stack to its app feature/purpose, encryption configuration, and lifecycle/retention policy. The sources of truth are `vouchington-infra/opentofu/s3.tf` and the purpose-specific S3 resource files; bucket name locals live in `vouchington-infra/opentofu/locals.tf`.

See also:

- [infrastructure.md](infrastructure.md) — AWS resources overview and cost estimates
- `vouchington-infra/opentofu/s3.tf` — bucket and lifecycle definitions
- `vouchington-infra/opentofu/s3-coverage-transport.tf` — transient CI coverage and Vitest-blob transport
- `vouchington-infra/opentofu/locals.tf` — bucket name locals (`local.s3_buckets`, `local.s3_test_buckets`, etc.)

---

## Contents

- <a id="table-a--buckets--purpose--configuration"></a>[Table A — Buckets × purpose & configuration](reference-s3-buckets-table-a-buckets-purpose-configuration.md)
- <a id="table-b--buckets--lifecycle-post-cost-review-rules"></a>[Table B — Buckets × lifecycle (post cost-review rules)](reference-s3-buckets-table-b-buckets-lifecycle-post-cost-review-rules.md)
- <a id="known-gaps"></a>[Known Gaps](reference-s3-buckets-table-b-buckets-lifecycle-post-cost-review-rules.md)
