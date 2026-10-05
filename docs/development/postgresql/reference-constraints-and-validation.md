# Constraints And Validation

[Back to PostgreSQL Data Store](README.md#constraints-and-validation)

- Prefer PostgreSQL-native constraints over application-only validation.
- Add checks for casing, trimming, maximum lengths, and regex validation where appropriate.
- A finite value set is an enum or a foreign key to a lookup table, never text; follow
  [R2](../postgres-schema-rules.md#r2--columns-say-their-type-and-target) for external values.
  Application enums have checked TypeScript catalogs. Vendor vocabularies use first-sight lookup
  registration without changing provider spelling; MIME values use the shared validated `media_types` lookup.
- Declare required foreign keys as `NOT NULL`.
- Always set an `ON DELETE` action on foreign keys.
- When a value should be lowercase or trimmed, enforce it with `CHECK` constraints instead of
  relying on application discipline.
