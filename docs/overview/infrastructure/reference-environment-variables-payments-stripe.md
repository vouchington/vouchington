# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Payments (Stripe)

| Name                          | Required | Where      | Notes                                                          |
| ----------------------------- | -------- | ---------- | -------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`           | Yes      | SM         | Stripe secret key                                              |
| `STRIPE_PUBLISHABLE_KEY`      | Yes      | ECS        | Stripe publishable key                                         |
| `STRIPE_EVENTS_SQS_QUEUE_URL` | Yes      | ECS worker | Private-infrastructure queue URL for Stripe EventBridge events |
