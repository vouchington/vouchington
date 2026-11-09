# Reporting & Content Moderation

Users can report content they believe violates community standards. A confirmed report creates or
updates a pending `moderation_reports` row in the database. The canonical review queue is the
`moderation_reports` table itself; admin tooling reads pending rows directly. Report integrity checks
still run asynchronously after report creation or update.

Clustered review pages keep current ordering keys separately from the report rows. Mutations and
cascades maintain those keys in the same transaction, so selecting a page does not scan every
report against a heavily reported target. The projection stores current aggregate facts rather
than pointers into report history; retention can remove reports without leaving stale cluster keys.

See also:

- [Actions](../navigation/ACTIONS.md) — Report placement principles
- [Signed-out Actions](../navigation/SIGNED_OUT_ACTIONS.md) — Report is auth-only
- [Moderation Flows](./MODERATION-FLOWS.md) — the automated pipeline around user reports
- [How Moderation Works](../../../articles/how-moderation-works.md) — public-facing overview
- `ts-shared/utils/moderation-policy.mts` — the policy registry report reasons derive from

## Reporter privacy

- The reporter is stored but never exposed to the reported user, who is not notified.
- Staff see full report rows. Community owners and moderators see community-scoped summaries
  without reporter identity, reporter notes, or note-derived AI judgements.
- Pending queues hide reports whose target was deleted, and deleting a post or comment dismisses its
  pending reports.
