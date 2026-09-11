# ActivityPub Delivery Queue

Fans an outbound Follow/Undo(Follow)/Like/Undo(Like) social action out to a local user's remote fediverse
followers, then delivers the signed AS2 activity to each follower's inbox (Phase C4).

## Queue

- Queue name: `activitypub-delivery`

## Jobs

- `distributeActivity`
  - One job per social action (a Follow relation write, or a Like/Undo-Like vote).
  - The caller supplies the PostgreSQL-backed activity ID. Follow retries reuse the active
    relation generation and a re-follow rotates it; Like retries reuse the current vote
    generation and a new Like after an Undo rotates it. Undo jobs carry both their own event ID
    and the exact original Follow/Like ID.
  - Legacy Follow/Like generations whose original delivered ID is unknown do not enqueue a new
    Undo. Follow deletion still enqueues Bluesky reconciliation because that worker re-derives
    current relation state.
  - Pre-upgrade `distributeActivity` Undo jobs missing `originalActivityId` are terminally discarded
    before federation checks or fan-out.
  - Checks the acting user has federation enabled — and, for Follow/Undo-Follow, that the target
    user does too (announcing a follow of a non-federated user would leak their actor URI/follow
    edge without their opt-in) — then uses the durable PostgreSQL
    `activitypub_distribution_checkpoints` cursor to read one strict keyset page of at most 500
    active follower candidates from `@services/remote-actors`, resolving current delivery
    eligibility only within that bounded page.
  - Bulk-enqueues the page's distinct inbox URLs, compare-and-swap commits the last remote actor
    only after that enqueue succeeds, then enqueues one continuation when another page remains.
    `distributeActivity` jobs are ordered at concurrency `1` per activity ID, so a large fan-out
    yields between pages instead of occupying a worker for its entire follower set.
- `deliverActivity`
  - One job per follower inbox. Builds the AS2 activity JSON (`@services/activitypub-delivery`)
    and signs + `POST`s it to the inbox.
  - Pre-upgrade Undo jobs missing `originalActivityId` are terminally discarded before federation
    checks, key access, activity construction, or network delivery.
  - `simple`-deduplicated on `deliver_<activityId>__<inboxUrl>` as a backstop against
    `distributeActivity` retries re-enqueueing an inbox that was already queued. It is not a
    durable per-inbox receipt and cannot make the remote HTTP side effect exactly once.

## Durability boundary

The checkpoint records only that Valkey accepted a bounded page, not that a remote inbox consumed
or acknowledged it. A failure between that acceptance and the checkpoint commit can replay the
page; delivery-job simple deduplication narrows duplicate active jobs, while an ambiguous remote
HTTP outcome still makes delivery at least once. There is no per-inbox receipt table and no
reconstruction after a Valkey wipe. Completed checkpoints intentionally remain until their source
user is deleted, preventing a later duplicate distribution job from restarting fan-out.

## Related

- Service: [../../services/activitypub-delivery](../../services/activitypub-delivery)
- Worker: [../../workers/activitypub-delivery](../../workers/activitypub-delivery)
- Follower inbox discovery: [../../services/remote-actors](../../services/remote-actors)
- Durable transition details: [../../workers/activitypub-delivery](../../workers/activitypub-delivery)
