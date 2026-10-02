# Classifier persistence service

Source entrypoint: [backend/services/classifiers/README.md](../../../../../backend/services/classifiers/README.md)

`@services/classifiers` owns primary configuration reads and durable classifier-decision lineage.
The agent-owned caller supplies a stable UUIDv7 batch identity. It may reserve that identity and its
active stored-candidate threshold snapshots before provider execution; otherwise, after every shard
has completed and candidate coverage has been validated, the service creates it while persisting.
Completion locks a reserved empty batch, writes its calls and concrete topic, story or community
prompt result rows, then marks the batch complete in the same transaction.

A classifier has one candidate kind. A `community_prompt` classifier (C8) scores each community
moderation prompt of one post's community: its results live in
`community_prompt_classifier_results`, carry no stored candidate or threshold revision, and always
use the prompt version's default thresholds (the table's trigger rejects any other value). Such a
batch requires a post subject and a `community_ai` scope, and a composite foreign key rejects a
prompt that belongs to a different community than the batch scope.

Reusing a completed batch ID returns the existing decision only when its subject, scope, shards,
candidate identity, probabilities, and native responses match exactly. A reserved empty batch is
not readable as a decision and can only be completed from its captured snapshots. Runtime-prefiltered
candidates retain the prompt defaults without creating a stored candidate or threshold snapshot.

There are two topic-only side-effect boundaries, and each owning classifier picks one.

`applyTopicClassifierDecisionRelations` attaches a decision to the exact post or RSS feed item it
classified (the C6 tagging classifier). It validates the decision, the expected topic bindings and
the shared system actor, locks the still-active topics, and maps every persisted threshold snapshot
with the same strict comparisons as below. A positive result creates (or finds) the topic category
relation on that subject through the transactional entity-relation write, with `skipIfDeleted`, so
a soft-deleted relation is never resurrected and the relation creator never changes. The shared
actor then casts an append-only relation election vote and the relation's vote statistics refresh
in the same transaction. A neutral or negative result votes only on an already live relation and
never creates one. Deleted or merged-away topics are skipped, never redirected. It returns the
topics whose relation is live and net positive after the write (`addedTopicIds`), and it never
writes a global topic election vote. Subject, content revision, stale fencing and replay identity
come from the shared classifier-run receipt, not from a separate application table: the receipt is
keyed by classifier, subject and content digest, completion runs in one transaction that fences
a result whose subject moved on and short-circuits a completed replay without a provider call. A
multi-topic write is atomic with that transaction. Relation vote-stat publication and the
notification reconcile run as post-commit actions that are awaited at commit.

`applyTopicClassifierDecisionVotes` is the global topic-vote side-effect boundary used by the post
classifier. Its owning classifier supplies one explicit shared system actor and the original
expected topic bindings. It re-reads C3's committed decision, rejects missing, duplicate, inconsistent, or story results, and maps each
persisted effective threshold snapshot with strict outer comparisons: below lower is downvote,
above upper is upvote, and both boundaries plus the interval are a durable neutral score of `0`.
It never re-resolves mutable candidate configuration. A transaction-scoped application receipt keys
the actor, topic, and classified subject: identical replays do nothing, while a newer UUIDv7 batch
supersedes an older application and an older retry cannot replace it. Human votes are never read or
changed.

## Threshold management

Staff manage a stored candidate's threshold override through the service, not by editing rows.
`listStaffClassifiers` returns each classifier with its active prompt version's defaults,
`listStaffClassifierCandidates` returns the candidates of one scope (global, or one community) with
the active revision and the effective thresholds the next decision would snapshot, and
`listClassifierThresholdRevisions` returns one candidate's full history newest first, across every
prompt version.

`setClassifierCandidateThreshold` sets an override for the active prompt version; a `null` bound
inherits that version's default, so two `null` bounds clear the override. Validation runs against
the active defaults: each bound is `null` or a number from 0 to 1 with at most four decimal places
(the stored scale, never silently rounded), and the effective lower bound stays strictly below the
effective upper bound. `rollbackClassifierCandidateThreshold` re-applies an earlier revision's
values, and only for the active prompt version; a revision of a superseded prompt version is a
conflict. Both lock the candidate row first (the lock decision snapshots share), deactivate the
active revision and insert a NEW one in the same transaction, so history is never rewritten and the
partial unique index keeps exactly one active revision. `created_by_id` and `deactivated_by_id`
carry the acting staff user, which is the audit record; there is no separate action log. Submitting
the values already in force writes nothing and reports `unchanged`. Neither call alters the prompt
version, its defaults or any past decision: a batch keeps the thresholds it snapshotted. Nothing in
the service changes a threshold on its own.

The two writers are imported by module path
(`@services/classifiers/change-classifier-candidate-threshold`), not from the package entry point.
Decision-time code and the classifier golden regression set import the entry point, and keeping the
writers off it means their import graph can never reach a threshold write.

## Human-vote comparison

`getClassifierHumanVoteComparison` reports how a topic classifier's stored decisions compare with
later human votes on the same relation. It is aggregate only: it never returns a vote, a voter or
post content. Decisions fall into probability tenths and the vote the stored effective thresholds
gave them (below lower is `-1`, above upper is `+1`, otherwise `0`), and each cell counts how many
decisions humans ended up voting up, down or neutral.

- **Humans only.** The classifier's own actor and every other `users.is_system` account are never
  joined, so a classifier or agent vote cannot appear as a human one. Each human counts once
  through their newest ballot on the live relation; a cleared ballot (`NULL` score) counts as none,
  and a `0` ballot is a neutral vote. A decision's outcome is the sign of its summed ballots.
- **Cohort floor.** A cell publishes its up/down/neutral split only when at least 20 distinct
  humans voted on its decisions; below that `human` is `null`. Distinct voters are counted rather
  than decisions, so one voter's ballot on an item the classifier re-scored many times cannot pass
  as a cohort. `human_decisions` and `human_voters` are still reported.
- **Bounded query.** The classifier and a date window are required: the window is a UUIDv7 id range
  on `classifier_decision_batches` (start inclusive, end exclusive) of at most 31 days. Community,
  post and RSS feed item filters are optional. Only completed batches count, newest first and capped
  at 1000, with `truncated` set when the window held more. Every filter resolves through an index
  that leads with the filter column and ends in the batch `id`, the classifier through
  `(classifier_id, id)`, so the scan never reads another classifier's batches or the days outside
  the window. The query-plan test asserts the id bounds, the index and a row-work ceiling in both
  `force_custom_plan` and `force_generic_plan` modes.
- **Scope.** Topic classifiers only; a story or community-prompt classifier answers 422, as does a
  window over 31 days, an empty window, or a request that filters by both a post and an RSS feed
  item. The report compares only votes on the post and RSS feed item topic relations.
