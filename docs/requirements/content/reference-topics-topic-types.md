# Topics reference

[Back to Topics](TOPICS.md)

## Topic Types

There are 7 topic types. The canonical runtime config lives in `web/types/topics.ts` (`topicTypes`), whose slug fields mirror `backend/types/entities/topic.mts`.

| `topic_type`             | URL slug                 | Notes                                                           |
| ------------------------ | ------------------------ | --------------------------------------------------------------- |
| `topic`                  | `topic`                  | Default type; used when no API payload type is supplied         |
| `rewards_program`        | `rewards-program`        | 1:1 structured-attribute extension                              |
| `referral_program`       | `referral-program`       | 1:1 structured-attribute extension                              |
| `card`                   | `card`                   | 1:1 structured-attribute extension; data-point eligible         |
| `rewards_program_status` | `rewards-program-status` | 1:1 structured-attribute extension                              |
| `bank_account`           | `bank-account`           | data-point eligible                                             |
| `rss_feed`               | `source`                 | Individual content source; primary rateable entity for creators |

The types `person`, `public_figure`, `organization`, and `brand` were removed (11 → 7). Their behavior — chiefly excluding minimal reference entities from indexing and forbidding reviews — is now expressed by the per-topic [Policy flags](#policy-flags) below, which any type can carry.

### When to add a type or extension table

A `topic_type` value or topic extension table must justify itself with functional behavior — a distinct 1:1 extension table, type-specific validation/assertions, or type-specific routing/SEO/UI. A type or extension table that would differ only by URL slug or sitemap membership must NOT exist; use the default `topic` type. Apply the same bar before adding any new topic type or extension table. [Backend rules](../../../backend/CLAUDE.md#topic-lifecycle-states) point here instead of duplicating this rule; the 11 → 7 consolidation was prompted by removed types that differed only by slug/sitemap.

When adding, removing, or renaming a `topic_type`, follow the [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md) before first push so migrations, web unions, explicit route directories, helper maps, generated tests, seed data, sitemaps, and docs stay aligned.

### Policy flags

Two per-topic boolean columns on `topics` carry the behavior that the removed `person` type used to imply. Admins set both in the **Visibility** section (`TopicFlagsSection`) of the topic Behavior settings page (`/:topic-type/:idOrSlug/settings/behavior`).

| Flag            | Default | Semantics                                                                                                                                                                                              |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `noindex`       | `false` | When `true`, the topic's pages emit `noindex` robots metadata (via `createNoIndexMetadata`). Sitemap membership is unaffected — that is still governed by the per-type `sitemap` flag in `topicTypes`. |
| `allow_reviews` | `true`  | When `false`, blocks review creation and hides review UI (Menubar `Reviews` item and the Contribute **Write a Review** link).                                                                          |

These flags replaced the `person` topic type: a minimal reference entity is now a default `topic` with `noindex = true` and `allow_reviews = false`, rather than a distinct type.

### Type vs facet

The taxonomy has two explicit axes:

- **Primary kind — `topic_type`.** Mutually exclusive (a topic has exactly one). It drives routing and the 1:1 structured-attribute extension table for the surviving structured types.
- **Additive facets — extension tables.** `topics__spending_categories` and `topics__retailers` are roles that ANY topic can carry regardless of `topic_type`. They are not mutually exclusive with each other or with the primary kind. The former "retailer requires brand/organization" restriction was removed — facet membership is no longer gated by `topic_type`.

### Reference fields

Some structured topic types store references to other topics by id. The single source of truth for which topic types each reference field may point at is `web/components/topics/settings/topic-edit-model.ts` → `topicReferenceFieldTypes`. The frontend `TopicAutocomplete` `topicTypes` filter is a **UX affordance, not a backend validation contract**: it narrows the picker but does not enforce anything. Backend enforcement lives in `backend/services/topics/validation.mts`; non-null filter entries must mirror those assertions.

| Field                 | Allowed topic types      | Enforced by backend?                                   |
| --------------------- | ------------------------ | ------------------------------------------------------ |
| `rewards_program_id`  | `rewards_program`        | Yes — `assertRewardsProgramExists`                     |
| `referral_program_id` | `referral_program`       | Yes — `assertReferralProgramExists`                    |
| `lifetime_version_id` | `rewards_program_status` | Yes — `assertRewardsProgramStatusExists`               |
| `company_id`          | any (unfiltered)         | No — backend only `assertTopicExists` (existence only) |
| `bank_id`             | any (unfiltered)         | No — backend only `assertTopicExists` (existence only) |
| `brand_id`            | any (unfiltered)         | No — backend only `assertTopicExists` (existence only) |

`company_id`, `bank_id`, and `brand_id` are intentionally unfiltered/unenforced — the picker accepts any topic and the backend only checks the referenced topic exists. Never hand-pass a `topicTypes` array literal at a call site; derive it from `topicReferenceFieldTypes`.
