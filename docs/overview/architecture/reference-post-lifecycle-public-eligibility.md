# Public Post Eligibility

[Back to Post / Comment Creation Pipeline](post-lifecycle.md)

Public eligibility is persisted state, separate from an individual viewer's authorization. The
canonical SQL owner is
[`buildPublicPostEligibilityFilter`](../../../backend/modules/feed-query-builders/post-publication-eligibility.mts).
Readers join a candidate post to `COALESCE(candidate.root_id, candidate.id)` and compose that
predicate; callers must not restate a partial publication check.

Post-publication reconciliation materializes the identities affected by this predicate in bounded
relational pages before cache, sitemap, or receipt effects. Its snapshot lifecycle and coordinated
worker activation barrier are owned by
[`backend/services/post-publication`](../../../backend/services/post-publication/README.md).

## Predicates

- **Core public state**: candidate and root are not deleted and are approved; the root has
  `privacy='public'`, `broadcast='everyone'`, an eligible visible community publication when scoped,
  and a discoverable RSS source when it is a story.
- **Public discovery**: core public state plus candidate and root are not archived and neither
  author has an active suspension. Search, feeds, RSS XML, sitemaps, ranking, semantic tools, and
  public aggregates use this predicate.
- **Viewer discovery**: authenticated feeds and listings retain viewer-specific author, membership,
  follow, and staff exceptions, but still compose the candidate/root direct eligibility predicate.
- **Direct access**: `canViewPost` and `buildDirectPostEligibilityFilter` authorize the requested
  candidate and its root for a viewer. They deliberately allow otherwise-visible archived content
  and do not treat a public-discovery exclusion as a direct-link denial.

## Eligibility matrix

| Dimension                     | Public discovery requirement                                                                                                                                                                                                                                                                                                    | Direct/viewer rule                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Type and provenance           | User-created discussion, link, review, data point, and comment use the shared lifecycle. `article` and `blog_post` are trusted only when created by an administrator. `story` is system-created through the story service and requires a discoverable source. `topic_recommendation` is excluded from ordinary public listings. | Viewer access follows the same candidate/root provenance and type gates; staff workflow routes remain explicitly scoped.   |
| Clearance state               | Candidate and root must be approved. Pending, in-review, rejected, and held rows are excluded.                                                                                                                                                                                                                                  | Creator and staff exceptions are viewer-specific; a pending candidate cannot inherit an approved root.                     |
| Audience                      | Root must be public to everyone.                                                                                                                                                                                                                                                                                                | Root broadcast/privacy may grant the creator, signed-in users, followers, mutual followers, members, or staff access.      |
| Root or source                | A comment must have an eligible root. A story post must retain an eligible discoverable RSS source.                                                                                                                                                                                                                             | The requested candidate is checked together with its root/source.                                                          |
| Community                     | Scoped content needs an active approved community review and a public, non-deleted community.                                                                                                                                                                                                                                   | Active members and staff can receive viewer-specific access; public community publication is still required for discovery. |
| Archive, deletion, suspension | Candidate/root archive, deletion, or active author suspension excludes discovery.                                                                                                                                                                                                                                               | Deletion always denies. Archive and suspension are discovery exclusions, not blanket direct-link denials.                  |

## Provenance boundary

Post type alone never grants trusted publication. Administrative article/blog creation and the
`@story-teller` story pipeline are controlled creation paths; other rows, including historical rows
with those types but no trusted creation provenance, use ordinary shared eligibility. This keeps
future authoring paths from becoming implicitly trusted by a type check.

For deployment audit, report historical long-form rows whose creator is not currently an
administrator. These are review candidates, not an automatic deletion set, because current roles
do not prove the role held at creation time:

```sql
SELECT post.id, post.post_type, post.created_by_id, post.created_at
FROM posts post
WHERE post.post_type IN ('article', 'blog_post')
  AND post.created_by_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM user_roles role
    JOIN user_roles_types role_type ON role_type.id = role.role_type_id
    WHERE role.user_id = post.created_by_id
      AND role_type.slug = 'administrator'
  )
ORDER BY post.created_at, post.id;
```

## Reader inventory

[`static-code-analysis/post-publication-reader-inventory.json`](../../../static-code-analysis/post-publication-reader-inventory.json)
classifies every reader found in the registered public-reader scopes in
[`post-publication-reader-inventory-source.mts`](../../../static-code-analysis/repo-file-policy/post-publication-reader-inventory-source.mts).
Adding a public service namespace therefore also requires registering its scope. Implemented public
SQL readers must import and call the canonical public predicate; boundary readers must revalidate
IDs through `getPublicPostIds`; direct readers must compose the canonical direct predicate or batch
access gate. Explicit exceptions record a structured rationale and an inventory-validated owning
classification; this metadata is review evidence, not static proof of a transitive consumer edge.
The repository guard rejects a nonempty `pr2_baseline`, unclassified readers inside registered
scopes, duplicate classifications, untracked paths, and bypassed canonical imports.
