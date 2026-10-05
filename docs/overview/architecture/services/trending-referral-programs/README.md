# Trending Referral Programs Service

Source entrypoint: [backend/services/trending-referral-programs/README.md](../../../../../backend/services/trending-referral-programs/README.md)

Returns referral programs ranked by number of active links created in the past 30 days.

## Data model

Reads from `referral_program_topics` joined with `user_referral_program_links`. Filters to enabled programs.

## Functions

- `getTrendingReferralPrograms(options)` → `{ referral_programs, page_info }` — cursor-paginated list ordered by `link_count DESC`
