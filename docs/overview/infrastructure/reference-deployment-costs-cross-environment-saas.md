# Deployment Costs reference

[Back to Deployment Costs](deployment-costs.md)

## Cross-Environment SaaS

Costs shared across both environments (not per-env AWS):

| Service            | Usage                                                                                          | Billing model                       |
| ------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Sentry**         | Error tracking — web, backend, CF worker, Lambda                                               | Event/transaction-metered           |
| **Cloudflare**     | Workers Free plan, Rate Limiting, DNS/CDN/WAF/bot management                                   | Free tier + optional usage/features |
| **Amazon Bedrock** | Nova multimodal embeddings (`amazon.nova-2-multimodal-embeddings-v1:0`), batch mode, us-east-1 | Token-metered                       |
| **Stripe**         | Payment processing (transaction fees apply at revenue)                                         | % per transaction                   |
