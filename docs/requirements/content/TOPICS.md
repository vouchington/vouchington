# Topics

Managing topics can only be done by an administrator. Topic types, creation rules, aliases and
lifecycle are read from `backend/services/topics` and the topic schema.

## Type vs facet

The taxonomy has two explicit axes:

- **Primary kind, `topic_type`.** Mutually exclusive. It drives routing and the 1:1
  structured-attribute extension table. A new type must justify itself with type-specific
  routing, SEO, or UI, or with a type-specific 1:1 extension table with its own validation. A
  minimal reference entity is a default `topic` with `noindex` and reviews disabled, not a distinct
  type.
- **Additive facets, extension tables.** Spending category and retailer are roles any topic can
  carry regardless of type. They are not mutually exclusive with each other or with the primary kind.

The frontend topic picker's type filter is a UX affordance, not a validation contract. Backend
validation is the enforcement.

## Merge lifecycle

A merge consolidates current references into one topic so follows, content, feeds and program
links continue to describe the same destination. The source remains as a redirect and as the
identity of its historical audit records. Publication capture connects the reference changes to
the asynchronous refresh of published content.

Merging across primary kinds would discard a different structured identity, so both topics must
have the same primary kind. The destination owns the surviving extension data. When a unique
subtype relationship has no defined consolidation policy, the merge refuses the conflict instead
of silently losing either relationship. Conflicting live feed ownership follows the same rule.
