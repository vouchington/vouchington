# Bluesky disconnect

A disconnect hides the account from ordinary readers immediately while retaining its exact link
authorization for cleanup. The pending account is the durable intent; a queue cursor is only a
position within that generation. The existing pending-disconnect sweep can restart a lost job
from the head because successful receipt deletions are durable.

Cleanup has two phases on the existing Bluesky ordering lane. Followee cleanup removes local
receipts owned by other followers, whose remote repositories the disconnecting user cannot edit.
Follower cleanup attempts a bounded page of remote deletions with the retained credential, then
deletes successful receipts in one statement. Its cursor advances over attempted records, including
provider failures, preserving the existing best-effort policy without letting one failed record
starve later records. Phase-tagged job identities distinguish equal cursor values in the two
phases and do not collide with the running job.

An unfinished page admits its continuation before revocation. Local read, receipt-write, or
continuation-admission failures leave the generation pending for retry. The final page revokes the
exact generation; the credential's receipt cascade prevents a later link from adopting old record
URIs. Relinking remains blocked while the pending generation is attached. Provider deletion or
authentication failures retain the existing best-effort behavior: disconnect can finish even when
some remote records could not be removed.

## Durable transitions

| Failure mode                                     | Detectable state                                                          | Recovery                                                                             | Idempotency                                                               | Evidence                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Dispatch failure                                 | Pending generation remains without runnable continuation progress         | Pending-disconnect sweep restarts from the head                                      | Generation and phase/cursor identity; completed receipt deletions persist | [Lost-continuation recovery](../../../backend/services/bluesky-follows/disconnect-followee-drain.test.mts)  |
| Provider non-consumption                         | Failed receipt remains behind the attempted-page cursor                   | Continue later records; terminal generation cleanup preserves best-effort disconnect | Repeating a deletion creates no replacement record                        | [Recorded provider failure](../../../backend/services/bluesky-follows/disconnect-pages.test.mts)            |
| Provider consumption, then receipt-write failure | Remote deletion may have succeeded; receipt and pending generation remain | Retry the page before revocation                                                     | Exact attempted URI guards prevent deleting a replacement receipt         | [Batch-delete retry](../../../backend/services/bluesky-follows/disconnect-read-failure.test.mts)            |
| Durable commit, then reply loss                  | Successfully deleted receipts are absent; generation may remain pending   | Retry or sweep reads the primary and skips absent receipts                           | Durable receipt absence and exact generation checks                       | [Continuation retry](../../../backend/services/bluesky-follows/disconnect-read-failure.test.mts)            |
| Retry/reconciliation                             | Pending account still owns the authorization                              | Existing sweep re-admits disconnect work without a cursor                            | Completed pages need no replayed remote calls                             | [Lost-continuation recovery](../../../backend/services/bluesky-follows/disconnect-followee-drain.test.mts)  |
| TTL expiry or exhausted queue retention          | Queue progress can disappear while PostgreSQL intent remains              | Existing pending-disconnect sweep re-drives the generation                           | Queue retention does not own completion state                             | [Pending generation recovery](../../../backend/services/bluesky-follows/disconnect-followee-drain.test.mts) |
| Orphan cleanup                                   | Exact linked generation is removed                                        | Foreign keys clear its receipts                                                      | New authorizations cannot inherit former receipt ownership                | [Generation isolation](../../../backend/services/bluesky-follows/receipts.test.mts)                         |
| Normal terminal removal                          | No further page remains; exact generation is revoked                      | No further work                                                                      | Stale-generation jobs return without mutating a newer link                | [Follower page completion](../../../backend/services/bluesky-follows/disconnect-followee-drain.test.mts)    |
