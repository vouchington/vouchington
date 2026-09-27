# Classifier persistence service

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

`applyTopicClassifierDecisionVotes` is the topic-only side-effect boundary. Its owning classifier
supplies one explicit shared system actor and the original expected topic bindings. It re-reads C3's
committed decision, rejects missing, duplicate, inconsistent, or story results, and maps each
persisted effective threshold snapshot with strict outer comparisons: below lower is downvote,
above upper is upvote, and both boundaries plus the interval are a durable neutral score of `0`.
It never re-resolves mutable candidate configuration. A transaction-scoped application receipt keys
the actor, topic, and classified subject: identical replays do nothing, while a newer UUIDv7 batch
supersedes an older application and an older retry cannot replace it. Human votes are never read or
changed.
