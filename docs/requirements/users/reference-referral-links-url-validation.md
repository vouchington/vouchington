# Referral Links reference

[Back to Referral Links](REFERRAL-LINKS.md)

## URL Validation

Referral programs can have validation rules that constrain which URLs users may submit. Validation is optional — programs without rules accept any URL.

### Schema

| Table                                       | Key columns                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referral_program_link_validations`         | `id`, `slug`, `user_help_text` — a named set of rules                                                                                                    |
| `referral_program_link_validations_rules`   | `hostname`, `pathname` (SQL LIKE pattern), `is_referral_link_url` (flags URLs that are valid referral links), `user_error_text`, `example_urls` (text[]) |
| `topics__referral_program_link_validations` | join table linking validation sets to referral program topics                                                                                            |

Multiple validation sets can be linked to one program; matching checks against all linked sets. A rule where `is_referral_link_url = TRUE` marks a URL pattern as a valid referral link.

### Form Behavior

When a referral program has validation rules with `example_urls`, the `ReferralLinkForm` uses the first `example_url` as the URL input placeholder instead of the generic `https://example.com/referral?ref=you`. The `user_help_text` from the validation set is displayed as a hint below the field label.

When a user submits an invalid URL, the backend returns the rule's `user_error_text` (e.g., "URL does not match the Chase referral program"). This is surfaced directly in the error toast via `onError()` from `@/lib/on-error`, which extracts the backend message from `ApiError.message`.

### Validation Info Endpoint

**`GET /api/v1/topics/:idOrSlug/referral-program/validation-info`**

- **Auth**: Public, rate-limited
- **Response**: `{ "validation_info": { "user_help_text": "...", "example_urls": ["..."] } }`
- **404**: If the topic has no linked referral program, or no validation rules exist with `example_urls`

Used by the server component in `web/lib/routes/topic-referral-factories.tsx` to pre-populate `validationInfo` on the referral link form.
