# OpenAI Moderation System

Queue system for OpenAI omni moderation jobs.

## Queue

| Queue                           | Processor                     | Group Keys | Default Priority |
| ------------------------------- | ----------------------------- | ---------- | ---------------- |
| `openai_moderation_omni_single` | `post`                        | -          | 10               |
| `openai_moderation_omni_single` | `image`                       | -          | 10               |
| `openai_moderation_omni_single` | `reconcile_image_quarantines` | -          | 100              |
| `openai_moderation_omni_single` | `reconcile_post_moderation`   | -          | 100              |

## Responsibilities

- run OpenAI moderation on posts and images
- persist typed, provider-neutral dispositions in the immutable post moderation ledger
- trigger follow-up clearance and notification reconciliation
- every minute, retry the bounded PostgreSQL set of CSAM image quarantine transfers whose durable
  `quarantine_pending_at` marker blocks ordinary image lookup
- every minute, re-derive due T+5/T+20 retries and the T+30 fail-closed review transition from
  PostgreSQL; queue jobs have one attempt because PostgreSQL owns retry state

## Related

- Service rules: [../../services/openai-moderation/README.md](../../services/openai-moderation/README.md)
- Systems overview: [../README.md](../README.md)
