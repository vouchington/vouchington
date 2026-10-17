# Data Points Specification

Data points are structured, typed records that users submit alongside posts. Unlike free-text
reviews they follow a schema per vertical, which enables aggregation, comparison, and trend
analysis. Schemas and validation live in `ts-shared/data-points` and
`backend/services/data-points`.

## Decisions

- **Public by design.** Data points are public so they can be aggregated. Financial fields are
  pre-filled from a member's private financial profile but become part of the public post once
  submitted.
- **Anonymous posting.** A member can post anonymously to contribute to aggregates while decoupling
  the data from their public identity. Other users see only "anonymous"; the creator and
  administrators retain the author metadata.
- **Profile pre-fill is opt-in on the way back.** Profile-sourced fields are pre-filled and
  overridable per submission. Writing changes back to the profile requires an unchecked-by-default
  "Save changes to my profile" choice and is best effort: a failed save never rolls back the post.
- **Per-application facts stay per-application.** For example, an existing relationship with an
  issuer reflects the applicant's state at that application and is deliberately not profile-scoped.
- **Extensible and versioned.** New verticals add schemas without changing the core data model, and
  an in-document schema version allows evolution without migrations.
