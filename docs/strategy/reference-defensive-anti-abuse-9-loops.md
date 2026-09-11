# Defensive / Anti-Abuse (9 loops)

[Back to Feedback Loops reference](reference-feedback-loops-existing-loops.md)

| Loop                              | Mechanism                                                                                                                                                                                                          | Status |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| **Vote Integrity**                | Velocity spikes + IP correlation detection, admin penalty (0.2x weight)                                                                                                                                            | Built  |
| **Spam Detection**                | 6 weighted signals, composite score ≥ 0.6 triggers rejection                                                                                                                                                       | Built  |
| **LLM Moderation**                | OpenAI omni + community agent moderators, clearance gate                                                                                                                                                           | Built  |
| **New Account Suppression**       | Accounts < 7 days get 0.01x vote weight, minimal/nearly zero ranking impact                                                                                                                                        | Built  |
| **Honeypot Bot Deflection**       | Hidden form fields catch bot signups/posts; returns fake success responses so bots don't learn they were filtered. Near-zero false-positive risk on real users (fields are invisible to browsers).                 | Built  |
| **Vote-Ring Cascade Penalty**     | Admin flags a spammer → 0.2x weight penalty applied to every upvoter of their content → all affected election stats re-enqueued for recompute → trust scores auto-correct. One admin action cascades network-wide. | Built  |
| **Referral-Link-in-Post Penalty** | Embedding affiliate links in a post triggers a one-shot vote-weight penalty via spam-detection signal. Deters SEO spam while allowing legitimate referral-link pages.                                              | Built  |
| **Community LLM Auto-Unpublish**  | Community-owned prompts with `on_flag_action='unpublish'` remove posts without a human moderator; scales community moderation as communities grow.                                                                 | Built  |
| **Content-SHA256 Dedupe**         | Community moderation only re-runs prompts when content changes (SHA-256 comparison). Edits cost one re-check; unchanged posts are never re-checked. Scales moderation cost sub-linearly.                           | Built  |
