# Classifier persistence service

Source entrypoint: [backend/services/classifiers/README.md](../../../../../backend/services/classifiers/README.md)

`@services/classifiers` owns primary configuration reads and durable classifier-decision lineage.
The agent-owned caller supplies a stable UUIDv7 batch identity. It may reserve that identity and its
active stored-candidate threshold snapshots before provider execution; otherwise, after every shard
has completed and candidate coverage has been validated, the service creates it while persisting.
Completion locks a reserved empty batch, writes its calls and concrete topic or story result rows,
then marks the batch complete in the same transaction.

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
