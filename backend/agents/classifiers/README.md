# Classifier orchestration

`@agents/classifiers` executes a logical classifier decision after its caller has assembled the
subject state and explicit candidate bindings. It does not render prompts, fetch candidate sets,
or apply votes, labels, tags, or story mutations.

The active classifier configuration is loaded from the primary database unless injected for a
test. Its primitive, candidate kind, provider, and model must match the input. Noul binds one
candidate to one question. Choice binds each candidate to one criterion in a shared question;
unbound criteria such as `none` are allowed but never become a result. Score is rejected because
the classifier result schema has no non-invented scalar projection for it.

The caller also supplies the prompt-version ID used to render those questions. Execution rejects a
different current version before dispatch, so persisted lineage cannot silently claim a prompt
revision other than the one the caller rendered.

State and question text use the branded `ClassifierSafeText` contract. Callers sanitize and wrap
every external post, RSS, topic, and community-authored fragment with
`sanitizeClassifierExternalContent`, then interpolate only those safe fragments into the static
`classifierPrompt` template tag. Choice criteria are bounded opaque keys, never external labels.

The caller pairs that policy with a C1 client fixed to the same transport/model route. This package
never constructs, replaces, or falls back from that client.

Callers must supply an exact synchronous token measurer for the active provider/model. Direct
TypeSafe is constrained by its 64k total-token and 32k state-plus-longest-question limits;
OpenRouter is constrained by its advertised 32k model context. Questions are indivisible and are
packed by deterministic first fit. There is deliberately no character, candidate-count, or guessed
token fallback.

Every shard uses the supplied structured-decision client in sequence. The package validates exact
answer and candidate coverage before calling `@services/classifiers` once. That service owns the
stable-batch replay check and its single PostgreSQL transaction.
