# Penalties

Penalties are durable moderation consequences that affect trust, voting influence, or future enforcement context.

## Vote-Weight Penalties

Table: `vote_weight_penalties`

| Source                   | Reason                     | Actor           | Reapply after revoke |
| ------------------------ | -------------------------- | --------------- | -------------------- |
| Voting-ring flag         | `voting_ring`              | Resolving admin | Yes                  |
| Referral link in post    | `referral_link_in_post`    | `automod`       | Yes, per post        |
| Blocked hostname         | `blocked_hostname`         | Blocking admin  | Yes, per hostname    |
| Blocked-hostname attempt | `blocked_hostname_attempt` | `automod`       | Stacks per attempt   |

Vote weight is read live by vote-weight calculation. These penalties do not invalidate JWT sessions.

## Report-Abuse Penalties

Table: `report_abuse_penalties`

Mass-report penalties lower trust tier through `users.bad_faith_reporter_at`. Trust tier is cached in the JWT `tt` claim, so apply/revoke paths invalidate sessions.

## Audit Rules

Automated vote-weight penalties use the `automod` system user as `created_by_id`; human-applied penalties use the acting admin/moderator. Revoked penalties remain in history and active-only unique indexes allow re-application after a later offense.

See also: [Report Integrity](../moderation/REPORT-INTEGRITY.md), [Moderation System Users](../moderation/MODERATION-SYSTEM-USERS.md).
