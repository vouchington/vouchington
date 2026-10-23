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

## Hostname ownership

Ownership changes serialize their conflict decisions while allowing a source topic and a
landing-page claim to coexist. Releases participate too, so a decision cannot rely on a claim
being removed concurrently. External risk assessment precedes this serialization because a
provider verdict can commit an independent ancestor-domain block; fresh local policy after the
lock wait connects that durable verdict to the ownership write. A redirected feed's source hide
stays scoped to the discovered topic, so concurrent feed reassignment cannot hide its new owner.

## Merge lifecycle

A merge consolidates current references into one topic so follows, content, feeds and program
links continue to describe the same destination. The source remains as a redirect and as the
identity of its historical audit records. Publication capture connects the reference changes to
the asynchronous refresh of published content.

Ownership serialization covers both merge participants before publication capture, so a concurrent
hostname claim cannot escape the source-to-destination transfer. Removed landing-page relations
participate because consolidation can revive a destination claim; the source's retained primary
hostname becomes an inactive claim when it becomes a redirect.

Merging across primary kinds would discard a different structured identity, so both topics must
have the same primary kind. The destination owns the surviving extension data. When a unique
subtype relationship has no defined consolidation policy, the merge refuses the conflict instead
of silently losing either relationship. Conflicting live feed ownership follows the same rule.

Live relations survive collisions with removed relations; among live claims, verification takes
precedence. Merging directly related topics removes the resulting self-relation, while a merge
that would create an indirect parent cycle is refused. An unresolved vote-integrity flag prevents
self-relation removal so the merge cannot erase an outstanding audit finding.
Image placements retain their source identity as history. Delayed classification applies no
effects to inactive topics. A dedicated merge fence protects new current references without refusing
ordinary reference writes during feed or vote-stat updates. Derived batch rows remain unfenced.
New embedding and classifier work admits only active topic identities; completed derived records
retain the identity they describe rather than being redirected by a later merge.

Classifier candidates are administrative configuration: source-only candidates keep their identity
and dependent thresholds, overrides, and reserved snapshots when moved. A destination candidate
wins a uniqueness collision. Classifier results remain derived; obsolete topic results are skipped
without retargeting the provider's answer to the destination.
Decision replay retains the full submitted input identity independently of derived results, so
removing an obsolete result cannot make conflicting batch reuse appear identical.

Local detector outcomes are immutable run receipts needed for completion and replay, so a merge
retains them. An inactive label topic cannot produce a current relation or vote.
