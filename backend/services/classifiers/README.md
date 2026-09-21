# Classifier persistence service

`@services/classifiers` owns primary configuration reads and durable classifier-decision lineage.
The agent-owned caller supplies a stable UUIDv7 batch identity only after every provider shard has
completed and candidate coverage has been validated. The service then writes the batch, active
stored-candidate threshold snapshots, ordered calls, and one concrete topic or story result row per
candidate in one transaction.

Reusing a batch ID returns the existing decision only when its subject, scope, shards, candidate
identity, probabilities, and native responses match exactly. Runtime-prefiltered candidates retain
the prompt defaults without creating a stored candidate or threshold snapshot. This package never
calls a provider and never applies a vote, label, tag, or story mutation.
