# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Analytics Pipeline

| Name                             | Required | Where       | Notes                                                                                                                  |
| -------------------------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ANALYTICS_BACKEND`              | No       | ECS + Local | `disabled`, `local`, or `firehose`; ECS backend/worker tasks set `firehose`                                            |
| `ANALYTICS_LOCAL_DIR`            | No       | Local       | Local JSONL root directory; defaults to `./tmp/analytics`                                                              |
| `ANALYTICS_FIREHOSE_PREFIX`      | No       | ECS + Local | Firehose stream prefix; ECS sets `voucha-analytics-${ENVIRONMENT}-`                                                    |
| `FIREHOSE_AWS_ACCESS_KEY_ID`     | No       | Local       | Optional local-dev access key for Firehose; falls back to `AWS_ACCESS_KEY_ID`; ECS uses the task role                  |
| `FIREHOSE_AWS_SECRET_ACCESS_KEY` | No       | Local       | Optional local-dev secret key for Firehose; falls back to `AWS_SECRET_ACCESS_KEY`                                      |
| `FIREHOSE_AWS_SESSION_TOKEN`     | No       | Local       | Optional local-dev session token paired with Firehose credentials; falls back only with the shared AWS credential pair |

See [analytics pipeline](../architecture/analytics-pipeline.md) for table names, retention, and the Firehose/S3 Tables storage path.
