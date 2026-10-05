# Trust System reference

[Back to Trust System](trust-system.md)

## Official Accounts and Material Connections

Voucha-affiliated accounts are operational identities, not independent consumer identities. Official people, including administrators and investors, and all automated system/AI accounts, must not influence community trust scores, rankings, aggregates, or referral-link social proof through public votes, reviews, data points, or personal endorsements.

Reserved people (`@jong`, `@voucha`) have `platform_account_kind='official'`; automated identities have `system`; members and the deleted tombstone have `NULL`. These kinds are mutually exclusive. System accounts cannot hold roles, and agents can belong only to system accounts. Public `account_type` is derived once: a live agent on a system account is `ai_agent` (including paused agents); other system accounts are `system`; reserved people or member accounts holding administrator/investor roles are `official`. Other members have no label. Usernames never determine account type.

Staff or other affiliated people may use separate non-role personal accounts for genuine personal consumer activity, but those accounts must disclose material connections where relevant.

### Official Account Permissions

| Action                                            | Official / System / AI Agent | Type                 |
| ------------------------------------------------- | ---------------------------- | -------------------- |
| Vote on entity relations (tags, categories, FAQs) | ✅ Allowed                   | Structural           |
| Vote on posts / topics / hostnames / feed items   | ❌ Blocked                   | Sentiment            |
| User trust or user-tag votes                      | ❌ Blocked                   | Sentiment / relation |
| Create/edit community reviews or data points      | ❌ Blocked                   | Sentiment            |
| Creator auto-positive choice on own post          | ❌ Suppressed                | Sentiment            |
| Personal referral-link endorsement                | ❌ Blocked                   | Endorsement          |
| Official Voucha referral link (admin-only)        | ✅ Allowed                   | Platform             |
| Admin moderation vote                             | ✅ Allowed                   | Internal tooling     |
| Moderator agent: tag post + move to review queue  | ✅ Allowed                   | Structural           |
| Following / commenting / reporting                | ✅ Not restricted            | Social               |

The restriction is enforced only at HTTP and authorization guards, not in the service-level relation and vote writers. The [platform-account writer audit](platform-account-writer-audit.md) lists every non-HTTP writer that casts a vote or writes an entity relation as a platform account, whether the restriction applies and why, and the mismatches with this table (M1 is resolved; M2 to M4 remain).

Classifier and AI accounts vote only on entity relations, never on topic or post elections.
