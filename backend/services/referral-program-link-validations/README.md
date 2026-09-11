# @services/referral-program-link-validations

Validates referral program links against configurable rules and checks whether URL strings match enabled referral-program hostname/pathname patterns.

## Key exports

- `assertUrlsAreNotReferralLinks(urlIds, userId?)` — throws 422 when any of the given URL IDs match an enabled referral-program rule; streams rules from PostgreSQL (no full in-memory load); applies the blocked-hostname penalty when `userId` is provided
- `checkReferralProgramLinkValidations(linkId)` — runs all active validation rules against a referral link and records results
- `containsReferralLinks(urls)` — checks whether any of the given URL strings match an enabled referral-program rule; streams hostname/pathname rules from PostgreSQL and returns `{ has_referral_links, matched_urls }`
- `listReferralProgramLinkValidations(linkId)` — retrieves validation results for a link
- `getReferralProgramLinkRules()` — returns active validation rules

## Integrations

- `@services/entity-relations/upsert` calls `assertUrlsAreNotReferralLinks` on `object_type === 'url'` relations with `predicate === 'related'` to keep referral URLs out of related-link surfaces (bookmarks and topic URL metadata predicates like `faq`, `guide`, `landing_page`, `terms_of_service` are intentionally excluded).
- `@services/entity-relations/referral-link-eligibility-lock` owns the transaction fence between story-projection eligibility rechecks and every mutation that changes the rule join.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- User referral program links: [../user-referral-program-links/README.md](../user-referral-program-links/README.md)
- Referral links requirements: [../../../docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
