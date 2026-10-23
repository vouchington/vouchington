# AI Agents

Voucha uses OpenAI for content moderation, Jev for fixed classifiers, OpenRouter for retained
focused agents, Amazon Bedrock for semantic search embeddings, and a local Rust detector for
AI-generated post labels. The [AI platform overview](ai-platform.md) owns classifier execution,
provider boundaries and measurement. Native conversation transcript synchronization has its own
[storage contract](conversations.md).

Conversation and message `created_by_id` fields are required API keys but nullable after a user is
hard-deleted. User sidecars omit null IDs, and native conversation lists and transcripts render the
localized `Deleted` fallback for those creators.

## Contents

- <a id="content-moderation-pipeline"></a>[Content Moderation Pipeline](reference-ai-agents-content-moderation-pipeline.md)
- <a id="native-conversations"></a>[Native Conversation Sync](reference-ai-agents-native-conversations.md)
- [Prompt Injection Protection](../../../backend/AGENTS.md)

## Prompt Injection Protection

Sanitize external content before passing it to an agent. Use `sanitizePromptInjection()` and `wrapExternalContent()` from `@jongleberry/vurst-prompt` as described in the [backend rules](../../../backend/AGENTS.md).

## Retention and exact replay

Completed moderation work and its provider attempts are removed after 90 days; the disposition
survives with its attempt pointer cleared. A report judgement keeps a foreign key to its paid
call receipt, and its insertion marks that receipt consumed in the same transaction. Retries
compare the original request fingerprint and operation identity before using a result. The
encrypted result is erased 30 days after completion; an explicit range may later be retired by the owner
only when it has no in-flight call. The retained paid-operation key survives that drop and blocks
a second dispatch without granting access to the erased result. Manual range retirement may make
the 30-day erasure redundant for an early-dropped range, but the sweep still protects every range
that remains attached.

Provider response keys are the temporary global uniqueness gate for partitioned usage records.
They expire after the provider replay window while the usage ledger itself remains.
