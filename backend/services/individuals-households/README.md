# Individuals & Households

Individual profiles, credit cards, rewards program statuses, households, and spending categories.

## Overview

This service manages the personal finance profile layer for users. An individual represents a user's financial identity (cards they hold, rewards statuses), while a household groups individuals for shared spending tracking. Spending categories can belong to either an individual or a household, enabling both personal and family-level expense tracking.

## Key Files

- `individuals-households.mts` — Convenience wrapper: `getHouseholdByUser` gets or creates both individual and household
- `authorization.mts` — Visibility and edit checks for spending categories and household operations
- `types.mts` — Spending frequency types (`monthly`, `annually`)

### [`individuals/`](individuals/)

- `individuals.mts` — Get or create the user's representative individual record
- `cards.mts` — CRUD for individual credit cards (with authorized user tracking)
- `cards-get.mts` — Card read queries
- `rewards-program-statuses.mts` — CRUD for rewards program tier statuses (with date range validation)
- `rewards-program-point-valuations.mts` — Point valuation tracking

### [`households/`](households/)

- `households.mts` — Household CRUD, membership management (add/remove individuals), auto-creation on first access
- `spending-categories.mts` — CRUD for household spending categories (amount, frequency, currency, notes)
- `spending-categories-get.mts` — Spending category read queries

## Data Model

- A user has at most one representative **individual** (auto-created on first access)
- A user can own multiple **households**
- Individuals can be members of households (with relationship labels)
- **Cards** belong to an individual, with optional authorized-user linking
- **Rewards program statuses** belong to an individual (with since/until date ranges)
- **Spending entries** belong to either an individual or a household (per-entry, not per-user), tracking amounts with monthly/annual frequency
  - Individual-level entries represent personal spending
  - Household-level entries represent shared family spending
  - Household owners can manage household spending entries; members can view but not modify

## Architecture Notes

- Authorization uses audience-based visibility: spending categories respect the user's `spending_categories_visibility` privacy setting
- Household owners can manage membership; members can view but not modify
- Household ownership is intentionally many-to-one: each user may own multiple households. Client
  presentation does not weaken per-household server authorization.
- Household and membership collections use scoped cursor pagination ordered by
  `updated_at DESC, id DESC`; member-only traversal excludes owned households.
- Household discovery starts from the caller's owner and membership indexes. Membership pages gate
  the page read with authorization in the same primary-database statement so committed revocations
  cannot race a replica-backed continuation.
- Both individuals and households are lazily created on first access (`getOrCreateIndividual`, `getOrCreateHousehold`)

## Related

- [Users Service](../users/README.md)
- [Topics Service](../topics/README.md)
- [Individuals API](../../api/v1/individuals/README.md)
- [Households API](../../api/v1/households/README.md)
