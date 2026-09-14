# Monetization (6 loops)

[Back to Feedback Loops reference](reference-feedback-loops-existing-loops.md#monetization-6-loops)

| Loop                                    | Mechanism                                                                                                                                                                                                                  | Status |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Contribution Gate**                   | Non-paid users must have a verified, non-disposable email and wait 7 days; per-action cooldown and daily limits vary by tier (see [Contribution Limits](../requirements/trust-safety/CONTRIBUTION-LIMITS.md))              | Built  |
| **Vote Weight**                         | Vote weight increases with paid tier; exact multipliers are not published (see [Membership Plans](../requirements/users/reference-memberships-plans.md#approved-public-benefit-language)). Paying makes your votes matter. | Built  |
| **Community Ownership**                 | Any signed-in user with a username can own communities; creation remains rate-limited for anti-abuse.                                                                                                                      | Built  |
| **Membership Lapse**                    | Cancel membership and paid-only benefits stop applying; community ownership does not transfer solely because a plan expired or paused.                                                                                     | Built  |
| **Community Agent Prompt Slot Economy** | Plus = 3, Pro = 10 LLM-moderator prompt slots; allocated atomically. More slots = ability to scale community moderation → bigger owned communities → more affiliate traffic.                                               | Built  |
| **Trust-Tier Rate Limits**              | Composite identity (IP + device + session + user) determines API ceiling; paid and older accounts get higher limits, monetizing platform reliability.                                                                      | Built  |
