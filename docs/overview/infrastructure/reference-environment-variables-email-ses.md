# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Email (SES)

| Name                                  | Required | Where      | Notes                                                                                                               |
| ------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET_SES_INBOUND`               | Yes      | ECS        | Private raw-mail bucket read by the dedicated backend worker and its durable reconciler                             |
| `INSTANCE_EMAIL`                      | No       | ECS        | Instance email address                                                                                              |
| `SES_CONFIGURATION_SET_TRANSACTIONAL` | No       | ECS        | SES configuration set for transactional email. Unset locally (no config set applied in dev)                         |
| `SES_CONFIGURATION_SET_MARKETING`     | No       | ECS        | SES configuration set for marketing email, isolated from transactional for deliverability reputation. Unset locally |
| `MARKETING_POSTAL_ADDRESS`            | No       | ECS        | CAN-SPAM physical address for marketing email footers. Falls back to a placeholder constant when unset              |
| `SES_BOUNCE_SQS_QUEUE_URL`            | Yes      | ECS worker | Private-infrastructure queue URL for SES bounce events                                                              |
| `SES_INBOUND_SQS_QUEUE_URL`           | Yes      | ECS worker | Private-infrastructure queue URL for inbound SES object notifications                                               |

SES credentials are provided via IAM role (no access key env vars needed in ECS).
