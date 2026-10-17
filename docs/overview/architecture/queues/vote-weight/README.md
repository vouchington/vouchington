# Vote Weight System

Source entrypoint: [backend/queues/vote-aggregation/README.md](../../../../../backend/queues/vote-aggregation/README.md)

Job queue for recalculating user vote weights based on auth strength, account age, subscription tier, and admin status.

## Processors

| Job (`vote-aggregation.` prefix)       | Type       | Priority | Description                                                                                                          |
| -------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| processRecalculateUserVoteWeight       | worker     | 10       | Recalculates a single user's vote weight; if changed, enqueues the first page of election stat updates               |
| enqueueUserElectionUpdates             | dispatcher | 100      | Continues a user's election fan-out from a (lane, id) cursor, one page of `election_fan_out_page_size` votes per job |
| processRecalculateVoteWeightDispatcher | dispatcher | 100      | Cursor-based batch dispatch for dirty markers and age-threshold recalculations                                       |

## Schedule

- `dailyVoteWeightRecalculation`: daily at 4:00 UTC — dispatches batch recalculation for users with
  `vote_weight_recalculated_at = NULL` or who crossed an age threshold. OAuth account linkage clears
  that marker atomically, so the schedule recovers a crash or immediate enqueue failure.

## Deduplication

- Per-user recalculation: debounce 60s TTL on `processRecalculateUserVoteWeight__{userId}`

## Related

- Service: [../../services/vote-weight/](../../services/vote-weight/README.md)
- Worker entry: [../../entrypoints/worker-io/README.md](../../backend/entrypoints/worker-io/README.md)
