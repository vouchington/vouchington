# Operations

Manual operational runbooks and diagnostic findings for procedures, checks, and
rerun criteria that are not fully managed by CI.

## Runbooks

| File                                                                           | Description                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| [TEMPLATE.md](TEMPLATE.md)                                                     | Template for new runbooks — required sections, lifecycle shapes, and stale-doc sync notes                      |
| [deployed-error-investigation.md](deployed-error-investigation.md)             | Find staging/production errors in CloudWatch alarms, Logs Insights, SQS DLQs, and Sentry                       |
| [bedrock-batch-dlq-purge.md](bedrock-batch-dlq-purge.md)                       | Diagnose and purge the `bedrock-batch-dlq` SQS dead-letter queue                                               |
| [cloudflare-worker-staging-auth.md](cloudflare-worker-staging-auth.md)         | Enable, rotate, and disable the HTTP basic-auth gate on `staging.voucha.ai`                                    |
| [fediverse-staging-interop.md](fediverse-staging-interop.md)                   | Validate public ActivityPub discovery, follow lifecycle, Accept delivery, transport, and unsupported workflows |
| [oauth-authorization-broker-rollout.md](oauth-authorization-broker-rollout.md) | Roll out the shared Facebook, X, and GitHub broker by provider and client mode                                 |
| [private-docs-site.md](private-docs-site.md)                                   | Launch and operate private docs on `docs.voucha.ai` and isolated Storybook on Cloudflare Pages                 |
| [review-succession-history-audit.md](review-succession-history-audit.md)       | Run and interpret the read-only historical review-succession audit                                             |
| [staging-turnstile-always-approve.md](staging-turnstile-always-approve.md)     | Enable and disable the staging Turnstile always-approve kill switch for MCP QA                                 |
| [valkey-memory-recovery.md](valkey-memory-recovery.md)                         | Diagnose Valkey memory pressure and use admin or audited ECS break-glass scoped recovery                       |

## Sync Rule

Keep each runbook or finding current with the implementation it describes. When the underlying
secret format, wrangler/Cloudflare commands, exempt paths, telemetry paths, or config constants
change, update the operational doc in the same commit or PR. The `## Stale-Doc Sync Notes` section
in each doc lists the specific source files and constants to watch.
