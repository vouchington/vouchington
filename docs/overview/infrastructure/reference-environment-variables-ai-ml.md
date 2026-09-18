# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## AI / ML

| Name                            | Required | Where       | Notes                                                                                                                                                                                                                                            |
| ------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_API_KEY`                | Yes      | SM          | OpenAI API key (moderation, agents, autotagging, reranking)                                                                                                                                                                                      |
| `BEDROCK_AWS_ACCESS_KEY_ID`     | No       | Local       | Optional local-dev access key for Bedrock embeddings; ECS uses the OpenTofu-managed task role                                                                                                                                                    |
| `BEDROCK_AWS_SECRET_ACCESS_KEY` | No       | Local       | Optional local-dev secret key for Bedrock embeddings                                                                                                                                                                                             |
| `BEDROCK_AWS_SESSION_TOKEN`     | No       | Local       | Optional local-dev session token when using temporary Bedrock credentials                                                                                                                                                                        |
| `BEDROCK_AWS_REGION`            | No       | Both        | Bedrock region for Nova embeddings; defaults to `us-east-1`                                                                                                                                                                                      |
| `BEDROCK_BATCH_ROLE_ARN`        | Yes      | ECS + Local | IAM role ARN Bedrock assumes for embeddings batch S3 input/output; set from OpenTofu task env in ECS, set to the `bedrock_batch_role_arn` output for local Bedrock work (see [`dev/README.md`](../../../dev/README.md#bedrock-embeddings-local)) |
| `BEDROCK_BATCH_SQS_QUEUE_URL`   | Yes      | ECS worker  | Private-infrastructure queue URL for Bedrock batch completion events                                                                                                                                                                             |

The following Bedrock batch tuning knobs and the moderation threshold are now Dynamic
Config-backed (namespace `bedrock-embeddings-batch-config` and `moderation-config`); edit
them at `/admin/dynamic-config` instead of via env vars. See
[Dynamic Config](../architecture/dynamic-config.md) for details.

Bedrock IAM roles are managed in `opentofu/iam-bedrock.tf` in the private `vouchington-infra` repository. Operators still need to enable access to Amazon Nova 2 Multimodal Embeddings V1 in Bedrock for `us-east-1`; no Bedrock access keys should be stored in ECS Secrets Manager.
