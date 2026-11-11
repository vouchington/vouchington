# Transactions

[Back to PostgreSQL Data Store](README.md#contents)

Newly owned transaction scopes use an explicit `await using` resource from `@vouchington/postgres`
(see [transactions.mts](../../../backend/data-stores/psql/transactions.mts)): it rolls back unless
`commit()` succeeds, and post-commit actions run only after that commit. `withTransactionOptions`
is only for joining a client already inside a transaction, because a nested scope must not own the
outer commit or rollback.

## Nested clients and transaction probes

Joining versus opening a transaction on a **borrowed** client needs a live backend probe
(`SAVEPOINT` / `RELEASE SAVEPOINT`), because the caller's state is not knowable statically. Owned
transactions acquire their own idle connection and need no probe. `25P01`
(`no_active_sql_transaction`) means the client is idle; any other error, including `25P02`, is
rethrown. Use raw `client.query` for the probe so the expected `25P01` is not recorded as a query
error in `pg_query_timing`.

## Why `getTransactionStatus()` is not a replacement

node-postgres rejects the query promise on `ErrorResponse`, before `ReadyForQuery` updates its
status. A callback reading the getter immediately sees stale `T`, and a promise `catch` is
packet-boundary racy: it sees `E` only if both packets parsed in the same turn. Upstream's own
tests run a follow-up `SELECT 1` before asserting `E`. Do not replace the SAVEPOINT probes with the
getter until upstream documents and tests a safe immediate `E`, and do not patch `pg`.

## Lock scope

A transaction locks only the rows it writes. It never locks rows it only reads, including:

- the parent and ancestors of the row
- the thread root
- the community
- membership sets

This applies to row locks (`FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`), advisory locks and
lock helpers alike.

**No unnecessary locks.** The owner's words (2026-11-09): "do we have a rule? no unnecessary locks",
"seems like we have way too many locks for no reason", and "keep things simple". Add a lock only
when a concurrent write would otherwise corrupt data the transaction writes. Advisory locks are not
used.

- **Caps and guards are best effort.** This covers per-user and per-entity caps and "don't remove
  the last X" guards. Check with a capped count, then write: no lock, no counter row, no slot
  table, and no constraint that exists only to serialize admission. Overshoot under a true race is
  accepted.
- **Removing a lock means deleting it**, not replacing it with another serialization mechanism such
  as a counter table, projection row, or claim table.
- **Write skew that must hold runs at SERIALIZABLE.** Where best effort is not acceptable, such as
  an administrator keeping an MFA method, the conflicting transactions run at SERIALIZABLE and a
  serialization failure (SQLSTATE `40001`) returns 409. There is no retry, and no lock, advisory
  lock, or conflict-forcing column. The owner's words (2026-11-10): "409s instead of locks and for
  simplicity are usually fine, especially for rare scenarios". The cost is a rare 409 the caller
  can resubmit; the benefit is no lock set that grows or deadlocks.

**Why:**

- Locks on read context grow with the data. A reply that locks its ancestor chain takes one lock
  per level of an unbounded depth.
- Every write that shares that context waits on the same rows, so unrelated branches of one thread
  take turns.
- Wider lock sets add lock-order cycles and deadlocks.

**How to close a race instead:**

- **Database guarantees:** foreign keys, unique and check constraints, and conditional
  `UPDATE ... WHERE` predicates on the written row.
- **Read-time rules:** readers resolve whatever window remains. For example, a reply written under
  a comment that is hidden at the same moment disappears with that comment's subtree when read.

Automated reviewers often report "race" findings that ask for locks on read context. Decline them
with a link to this section instead of adding the lock.
