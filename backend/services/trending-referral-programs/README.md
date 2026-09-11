# Trending Referral Programs Service

Returns referral programs ranked by number of active links created in the past 30 days.

## Data model

Reads from `topics__referral_programs` joined with `user_referral_program_links`. Filters to enabled programs.

## Functions

- `getTrendingReferralPrograms(options)` → `{ referral_programs, page_info }` — cursor-paginated list ordered by `link_count DESC`
