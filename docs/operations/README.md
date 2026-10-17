# Operations

Manual procedures and safety contracts for operations that CI and code do not perform. Commands,
account selection, and resource identifiers live in the private operator runbooks; these pages keep
the decision boundary and the order of steps.

| File                                                                           | Description                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| [deployed-error-investigation.md](deployed-error-investigation.md)             | Read-only investigation boundary for staging and production errors                          |
| [bedrock-batch-dlq-purge.md](bedrock-batch-dlq-purge.md)                       | Safety contract for triaging and purging the Bedrock batch dead-letter queue                |
| [cloudflare-worker-staging-auth.md](cloudflare-worker-staging-auth.md)         | Staging Basic Auth gate behavior, exempt paths, and verification                            |
| [fediverse-staging-interop.md](fediverse-staging-interop.md)                   | Validate ActivityPub discovery, follow lifecycle, Accept delivery, and transport on staging |
| [oauth-authorization-broker-rollout.md](oauth-authorization-broker-rollout.md) | Roll out the shared OAuth broker by provider and client mode                                |
| [staging-turnstile-always-approve.md](staging-turnstile-always-approve.md)     | Staging Turnstile always-approve kill switch for MCP QA                                     |
| [valkey-memory-recovery.md](valkey-memory-recovery.md)                         | Decision boundary for Valkey memory-pressure diagnosis and recovery                         |
