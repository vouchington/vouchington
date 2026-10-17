# Review Disputes

Review disputes let a verified topic claimant formally contest a review of their topic on legal
grounds. This is deliberately narrower than a [moderation appeal](./MODERATION-APPEALS.md): only a
user with a verified `topic_claim` for the reviewed topic can dispute.

- Resolution is `remove` (the reviewed post is removed), `annotate` (a moderator note is attached
  and the review stays up), or `dismiss`.
- As with appeals, a `dispute-resolution` AI agent only drafts. No text reaches the disputant
  without a moderator approving and delivering it, and the post author is notified when removal or
  annotation applies.
- A claim is verified by domain ownership or by an administrator, and can later be revoked.
