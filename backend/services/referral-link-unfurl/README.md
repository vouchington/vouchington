# referral-link-unfurl

Service for turning one pasted Amex referral link into a per-card referral link for every Amex
card, so a user only has to paste their referral link once.

## Purpose

American Express issues a single referral code that fans out into a per-card referral URL for
every card Amex offers. This service "unfurls" a user's Amex referral link: follows the link's
server redirect to capture the user's minted referral tokens (`CORID`/`GENCODE`/etc.), constructs
every per-card referral URL from a curated card catalog, and creates a child
`user_referral_program_links` row per card via
`@services/user-referral-program-links#createChildReferralLink`.

## Why the card catalog is curated, not scraped

Amex's card-selection page is a virtualized single-page app: only a handful of card tiles ever
mount in the DOM at once, there is no embedded hydration payload to read instead, and scripted
scrolling to force more tiles to mount freezes the headless browser. The full card list therefore
cannot come from runtime extraction — it is a build-time curated seed
(`seed/referral-programs-topics.csv`), and children are **constructed** from
`{captured params} × {seeded slugs}`, not scraped from the rendered page.

The seeded per-card `referral_program` rows are the single source of truth for the slug catalog —
there is no separate catalog artifact. Adding support for a new Amex card means adding one CSV row;
`getAmexCardSlugCatalog` picks it up automatically.

## Modules

- `construct-amex-children.mts`
  - `getAmexCardSlugCatalog(options?)` — reads the seeded Amex personal/business
    `referral_program` rows (hostname `*.americanexpress.com`, pathname under
    `/en-us/referral/{personal,business}/`) and returns their card slugs. Excludes the all-cards
    parent program.
  - `constructChildUrls(finalUrl, catalog)` — pure/synchronous. Builds one
    `https://www.americanexpress.com/en-us/referral/<personal|business>/<slug>` URL per catalog
    entry, copying the full query param set captured on `finalUrl` verbatim onto each. No browser,
    no DB — unit-testable with fixtures alone.

## Related

- Seed data: [../../../seed/referral-programs-topics.csv](../../../seed/referral-programs-topics.csv)
- Referral link validation engine: [../referral-program-link-validations/](../referral-program-link-validations/README.md)
- Child link create/lifecycle: [../user-referral-program-links/](../user-referral-program-links/README.md)
- Browser crawl (captures `finalUrl`): [../browser-crawl/](../browser-crawl/README.md)
