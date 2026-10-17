# Email Classification

Every outbound email has exactly one authoritative classification, `transactional` or `marketing`,
enforced structurally so a new email type cannot ship unclassified. Service implementation:
[email-classification service](../../overview/architecture/services/README.md).

## Why

Mixing transactional and marketing traffic on one SES identity means a marketing bounce or complaint
spike can degrade deliverability for auth emails such as login tokens and email verification.
Classification therefore selects separate SES configuration sets for reputation isolation.

## Single choke point

All senders call `sendClassifiedEmail()`; direct imports of the SES or SMTP senders are
test-forbidden elsewhere. That is what makes an out-of-band, unclassified sender impossible to add.
The registry is exhaustive by type and cross-checked against every email processor.

## Judgment calls

- **Welcome is transactional.** It is a one-shot onboarding email, not a subscription, so it has no
  unsubscribe path.
- **Community moderation summary is marketing.** It is recurring and preference-gated, so it behaves
  like a subscription even though the content is operational. It carries a visible unsubscribe link.

## Suppression policy

Bounce and complaint suppression applies to marketing email only. Suppressing transactional sends on
a stale or misclassified permanent bounce would lock users out of login and verification, an
availability regression on the most security-sensitive send path, for no compliance benefit.
Marketing is also skipped when the user opted out of its category. This is a backstop on top of each
processor's own dedup state machine, which is unrelated to classification.

## SES configuration sets

The marketing set has its own event destination routed to the same bounce topic as the
transactional set. Without it, marketing bounce suppression would silently stop working.

## CAN-SPAM footer

Marketing templates require a physical postal address prop and an unsubscribe link, enforced by a
test. Transactional templates cannot accidentally render the address because the prop is required
only on marketing types.

## Related

- [Membership renewal notifications](../users/memberships.md)
- [Job replayability](JOB-REPLAYABILITY.md)
- [Email templates catalog](../../overview/architecture/email-templates/README.md)
