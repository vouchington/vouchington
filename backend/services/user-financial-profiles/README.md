# User Financial Profiles Service

Manages the `individual_financial_profiles` table — a 1:1 extension of `individuals` that stores a user's
self-reported financial summary for pre-filling data point forms.

## Purpose

When a user creates a data point, common fields like credit score range and stated income are often
the same across multiple submissions. This profile pre-fills those fields to save time.

## Table: `individual_financial_profiles`

| Column                              | Type        | Description                                                         |
| ----------------------------------- | ----------- | ------------------------------------------------------------------- |
| `individual_id`                     | UUID PK     | References `individuals(id)`                                        |
| `currency_code`                     | TEXT FK     | Record-wide currency for all profile money                          |
| `credit_score_range`                | TEXT        | Credit score bracket (e.g. `670-739`)                               |
| `stated_income_minimum_minor_units` | BIGINT      | Inclusive annual-income minimum                                     |
| `stated_income_maximum_minor_units` | BIGINT      | Exclusive maximum; null means unbounded                             |
| `total_credit_limit_minor_units`    | BIGINT      | Total credit across all cards                                       |
| `years_of_credit_history`           | SMALLINT    | Length of credit history in years                                   |
| `hard_inquiries_12m`                | SMALLINT    | Hard pulls in the last 12 months (credit card vertical only)        |
| `cards_opened_24m`                  | SMALLINT    | New cards opened in the prior 24 months (credit card vertical only) |
| `updated_at`                        | TIMESTAMPTZ | Last update timestamp                                               |

`hard_inquiries_12m` and `cards_opened_24m` are relevant only for the credit card vertical. They
are shown in the "Your Profile" section of the data point form for that vertical but not for bank
accounts.

## API

- `GET /api/v1/my/financial-profile` — returns the current user's profile (or `null` if not set)
- `PUT /api/v1/my/financial-profile` — upserts the profile with provided fields

On first creation, callers may provide any partial update. The profile currency is selected from an
explicit `currency`, otherwise from a supplied `stated_income_range` or `total_credit_limit`, and
otherwise defaults to `usd`. Existing profiles retain their currency when it is omitted. Every
provided monetary field must use the selected profile currency.

Profile writes lock the owning individual row for the transaction, so concurrent first creates and
updates serialize before currency inference and cannot combine amounts from different currencies.

## Privacy

The financial profile is **always private** and only accessible via authenticated `/my/` routes. The profile itself is never shared publicly or with other users.

However, the financial fields from this profile (credit score range, stated income range, etc.) are **pre-filled into data points**, which users post publicly by design. Users can post data points anonymously via the `is_anonymous` flag to avoid linking their data to their account, while still contributing to public aggregations.

## Files

| File           | Description                                                                           |
| -------------- | ------------------------------------------------------------------------------------- |
| `types.mts`    | Re-exports `UserFinancialProfile` from `@voucha/types/entities/data-point`            |
| `validate.mts` | `assertValidFinancialProfile(data)` — validates money, range, and currency invariants |
| `get.mts`      | `getUserFinancialProfile(userId)` — fetches the profile                               |
| `upsert.mts`   | `upsertUserFinancialProfile(userId, input)` — creates or updates                      |
| `index.mts`    | Barrel exports                                                                        |

## Allowed Values

Field values must match the data-points service registry (`@services/data-points/verticals`):

- `credit_score_range`: `300-579`, `580-669`, `670-739`, `740-799`, `800-850`
- `stated_income_range`: inclusive `Money` minimum plus a greater, same-currency exclusive maximum
  or a null maximum for an unbounded range
- `total_credit_limit`: non-negative `Money` in the profile currency
- `hard_inquiries_12m`: non-negative integer, 0–100
- `cards_opened_24m`: non-negative integer, 0–100

## Related

- [Data Points Service](../data-points/README.md)
- [Individuals & Households Service](../individuals-households/README.md)
- [Currency-aware integer money contract](../../../docs/overview/architecture/monetary-values.md)
