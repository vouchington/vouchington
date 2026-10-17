# Product-Safety / Recall Handling Runbook

Handling for content that promotes, sells, or links to a product that has been officially recalled or
poses a verified safety risk: official recalls (CPSC, FDA, NHTSA, USDA, or equivalent), manufacturer or
consumer-safety alerts, and user reports of serious injury or illness. General misinformation about
product quality follows the standard [Moderation Flows](../requirements/moderation/MODERATION-FLOWS.md).
Reports arrive through the `illegal_content` or `other` report reasons.

## Triage

1. **Verify the recall** against the official source (CPSC, FDA, NHTSA, USDA FSIS, or the manufacturer
   announcement) before acting.
2. **Assess severity.** Is there a verified safety risk or injury, and is the product actively promoted
   or sold through the platform?
3. Engage legal before taking enforcement action or communicating externally, and route press inquiries
   to communications immediately.

## Containment and enforcement

1. **Remove or hide** the posts or links promoting the recalled product through the community moderation
   queue, or platform staff enforcement for cross-community content.
2. **Block the seller hostname** when one is identified, through the hostname blocking flow (the
   `/domain/<hostname>` Moderation tab). It blocks the domain and subdomains and soft-deletes URL
   relations; reporting against a `url_hostname` does not itself block it.
3. **Suspend the seller account** if it is primarily engaged in selling the recalled product.
4. Record every enforcement action in the modlog.

Do not communicate externally before legal has reviewed the message.

## After-action

Keep an incident summary (timeline, affected content volume, enforcement steps, external notifications),
hold a post-incident review within 14 days, and file an issue for any systemic platform gap the recall
reveals.
