# Moderation Policy Matrix

Single source of truth for the platform content policy. The canonical runtime artifact is
`ts-shared/utils/moderation-policy.mts`. This document mirrors that registry for human review
and keeps stakeholders in sync with ToS §4 and the moderation help article.

## Policy Entries

The table below is derived from `MODERATION_POLICY` in `ts-shared/utils/moderation-policy.mts`.
Each row is a policy entry that may apply to report reasons, AI content-policy categories, or both.

| Key               | Label             | Report Reason | AI Category | Surfaces | Severity | Appeal Eligible | Recommended Action (advisory) |
| ----------------- | ----------------- | ------------- | ----------- | -------- | -------- | --------------- | ----------------------------- |
| spam              | Spam              | ✓             | ✓           | all      | low      | ✓               | remove                        |
| harassment        | Harassment        | ✓             | ✓           | all      | high     | ✓               | remove                        |
| misinformation    | Misinformation    | ✓             | ✓           | all      | medium   | ✓               | warn                          |
| illegal_content   | Illegal content   | ✓             | ✓           | all      | critical | ✓               | escalate                      |
| hate_speech       | Hate speech       | —             | ✓           | all      | high     | ✓               | remove                        |
| sexual_content    | Sexual content    | —             | ✓           | all      | high     | ✓               | remove                        |
| violence          | Violence          | —             | ✓           | all      | critical | ✓               | escalate                      |
| privacy_violation | Privacy violation | —             | ✓           | all      | high     | ✓               | remove                        |
| off_topic         | Off topic         | —             | ✓           | all      | low      | ✓               | no_action                     |
| vote_manipulation | Vote manipulation | ✓             | —           | post     | medium   | ✓               | escalate                      |
| other             | Other             | ✓             | —           | all      | low      | ✓               | no_action                     |

"all" means all `MODERATION_REPORT_ENTITY_TYPES`: `rss_feed_item`, `post`, `comment`, `user`,
`url_hostname`.

## Derived Lists

The two lists that existed before this registry are now derived automatically:

- **Report reasons (List A)** — `MODERATION_REPORT_REASONS` — entries with `isReportReason: true`:
  `spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`
- **AI content-policy categories (List B)** — `CONTENT_POLICY_CATEGORIES` — entries with
  `isAiCategory: true`:
  `spam`, `harassment`, `misinformation`, `illegal_content`, `hate_speech`, `sexual_content`,
  `violence`, `privacy_violation`, `off_topic`

## Action Enums

Four action enums are now first-class exports of the policy registry:

| Export                         | Values                                    | Used by                                           |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------- |
| `MODERATION_JUDGEMENT_ACTIONS` | `no_action`, `warn`, `remove`, `escalate` | `moderation_report_judgements.recommended_action` |
| `MODERATION_APPEAL_ACTIONS`    | `accept`, `deny`, `reduce`                | `moderation_appeals.resolution_action`            |

`recommendedAction` on each policy entry is advisory only. Runtime auto-dispatch wiring is Phase 4
(#5673).

## Severity Levels

| Level    | Meaning                                                          |
| -------- | ---------------------------------------------------------------- |
| low      | Minor policy infraction; monitor before action                   |
| medium   | Noteworthy violation; warn or escalate for staff review          |
| high     | Serious harm potential; remove content and notify user           |
| critical | Immediate escalation required; potential legal/safety obligation |

Severity values are PROPOSED pending product sign-off.

## Runbooks

Operational procedures for incidents that require legal action or cross-functional coordination. These
are staff-only documents; see [Operational Runbooks](../../runbooks/README.md) for the index.

| Runbook                                                                     | Relevant rows                       | Notes                                                                                                     |
| --------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| CSAM / Child-Safety Escalation                                              | `illegal_content`, `sexual_content` | Covers CSAM and any `sexual_content` incident involving a minor. Legal reporting obligations (US §2258A). |
| [Product-Safety / Recall Handling](../../runbooks/product-safety-recall.md) | _(no row yet — forward-looking)_    | Applies as marketplace surfaces ship; no `product_safety` entry exists in the matrix today.               |

Note: "CSAM" is not a literal policy row — it is described under `illegal_content` ("including CSAM,
fraud, or incitement"). There is no `recall` row; that runbook is anticipatory.

## Maintenance

- Edit `ts-shared/utils/moderation-policy.mts` as the source of truth.
- Update this table to match any registry changes.
- Keep ToS §4 and `articles/how-moderation-works.md` in sync with both.
- Paid transparency aggregates are not policy entries. Their 48-hour delay, cohort suppression,
  and rounding boundary is defined in [Moderation Analytics](./MODERATION-ANALYTICS.md).

## Related Issues

- Phase 1 (#5561) — shipped
- This document: Phase 3 (#5672)
- Phase 4 — runtime auto-dispatch (#5673)
