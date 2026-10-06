# Classifier orchestration

Source entrypoint: [backend/agents/classifiers/README.md](../../../../../backend/agents/classifiers/README.md)

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
every external post, RSS, topic, and community-authored fragment with the classifier content
sanitizers, then interpolate only those safe fragments into the static
`classifierPrompt` template tag. Choice criteria are bounded opaque keys, never external labels.
For fixed operator-owned policy and questions, `renderFixedClassifierRequest` places the policy
once outside the sanitized external state wrapper and retains each question independently. It
accepts only trusted configuration instructions, not raw subject content; the post-classifier builder
checks those instructions against its compiled catalog before rendering.

`sanitizeClassifierExternalContent` is retained provisionally under issue #1360 as a documented
sanitizer API. External production use is unconfirmed, and the export may be removed after
intended-use review; the multi-part sanitizer remains the path used by current classifier builders.

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

`prepareSingleCallClassifierDecision` performs the same validation and one provider call but
returns the complete durable decision input without persisting it. Callers that must atomically
combine a decision with another receipt use that prepared input in their own transaction.

## Credentialed golden regression set

The C5 post-classifier and C6 autotagger OpenRouter tests run a checked-in set of synthetic posts
and feed items through production prompt construction, candidate bindings, and the active threshold
snapshot. They compare decision bands rather than exact probabilities, allow one unexpected fixture
per candidate, require at least three fixture results per candidate, and include at least two
independent positive examples for each candidate. Every fixture must return exactly one result per
candidate. Each fixture makes one provider call; the tests report call count and elapsed time. C5
uses each active candidate threshold revision; C6 uses the active prompt version's default-threshold
revision. Updating expected bands or tolerances is an ordinary reviewed baseline change. The
import-graph test prevents classifier threshold, prompt-version, or configuration writes from
entering the harness. This is a regression set, not calibration or threshold tuning.
