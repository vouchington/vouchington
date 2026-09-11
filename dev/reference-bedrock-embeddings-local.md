# Bedrock Embeddings (local)

[Back to Dev Environment Reference](README.md#bedrock-embeddings-local)

The `bedrock-embeddings-batch` worker uploads `input.jsonl` to S3, then invokes a Bedrock batch job. Local runs must target the developer sandbox bucket `voucha-bedrock-batch-dev-staging`, never the staging primary bucket. Required setup:

1. Assume `voucha-developer-staging` to get short-lived credentials. The `Dev` IAM user's static keys do **not** have permission to write the Bedrock input prefix or invoke `CreateModelInvocationJob` directly — calling `AssumeRole` first is required.

   > User-side `sts:AssumeRole` permission is not managed by the application repository: the role's trust policy permits the `Dev` user, but the user must also have IAM permission to invoke `AssumeRole`. An account admin attaches that permission once, out-of-band (inline policy on the user, or membership in a group that grants it).

   ```bash
   creds=$(aws sts assume-role \
     --role-arn "$(cd /path/to/vouchington-infra/opentofu && tofu output -raw developer_role_arn)" \
     --role-session-name "$USER-$(date +%s)" \
     --duration-seconds 43200 \
     --query 'Credentials' --output json)
   ```

2. Override the long-lived `Dev` credentials in `~/voucha.env` for the session and add the dev-bucket + Bedrock-batch role overrides:

   ```bash
   S3_AWS_ACCESS_KEY_ID=<creds.AccessKeyId>
   S3_AWS_SECRET_ACCESS_KEY=<creds.SecretAccessKey>
   S3_AWS_SESSION_TOKEN=<creds.SessionToken>
   BEDROCK_AWS_ACCESS_KEY_ID=<creds.AccessKeyId>
   BEDROCK_AWS_SECRET_ACCESS_KEY=<creds.SecretAccessKey>
   BEDROCK_AWS_SESSION_TOKEN=<creds.SessionToken>
   S3_BUCKET_BEDROCK_BATCH=<your-local-bucket>
   BEDROCK_BATCH_ROLE_ARN=<output: bedrock_batch_role_arn>
   ```

3. Regenerate the worktree environment and restart backend services so the routing identity and AWS
   overrides are picked up:

   ```bash
   ./dev/initialize web
   ./dev/stop-services
   ./dev/tmux
   ```

`./dev/initialize` writes `ENVIRONMENT=development` into the worktree `.env`; Bedrock batch
submission requires that explicit routing identity so local completion events cannot be mistaken for
staging or production events.

The dev bedrock-batch bucket has a 7-day object lifecycle, so drafts are auto-pruned. Resolve the bucket and role values from the private `vouchington-infra` OpenTofu outputs; do not copy their production identifiers into this repository.
