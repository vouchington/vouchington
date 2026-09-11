# OpenAI Moderation System

Queue system for OpenAI omni moderation jobs.

## Queue

| Queue                           | Processor | Group Keys | Default Priority |
| ------------------------------- | --------- | ---------- | ---------------- |
| `openai_moderation_omni_single` | `post`    | -          | 10               |
| `openai_moderation_omni_single` | `image`   | -          | 10               |

## Responsibilities

- run OpenAI moderation on posts and images
- persist moderation results and content hashes
- trigger follow-up clearance and notification reconciliation

## Related

- Service rules: [../../services/openai-moderation/README.md](../../services/openai-moderation/README.md)
- Systems overview: [../README.md](../README.md)
