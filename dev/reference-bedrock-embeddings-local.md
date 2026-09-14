# Bedrock Embeddings (local)

[Back to Dev Environment Reference](README.md#bedrock-embeddings-local)

The `bedrock-embeddings-batch` worker uploads `input.jsonl` to S3, then invokes a Bedrock batch
job. Local runs must use an isolated developer bucket and short-lived, least-privilege credentials;
they must never target staging or production resources.

Follow the private `vouchington-infra` operator runbook to obtain the deployment-specific values.
The application-facing inputs are `S3_AWS_ACCESS_KEY_ID`, `S3_AWS_SECRET_ACCESS_KEY`,
`S3_AWS_SESSION_TOKEN`, `BEDROCK_AWS_ACCESS_KEY_ID`, `BEDROCK_AWS_SECRET_ACCESS_KEY`,
`BEDROCK_AWS_SESSION_TOKEN`, `S3_BUCKET_BEDROCK_BATCH`, and `BEDROCK_BATCH_ROLE_ARN`. Do not copy
credential values, role identifiers, bucket names, account identities, or infrastructure output
names into this repository.

After the private runbook has supplied those inputs, regenerate the worktree environment and restart
the backend services:

```bash
./dev/initialize web
./dev/stop-services
./dev/tmux
```

`./dev/initialize` writes `ENVIRONMENT=development` into the worktree `.env`; Bedrock batch
submission requires that explicit routing identity so local completion events cannot be mistaken for
staging or production events.

The isolated developer bucket must enforce short retention according to the private infrastructure
policy.
