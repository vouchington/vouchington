# Moderation Service

Business-logic helpers for post-moderation agents, moderation prompt retrieval, and persisted moderation result metadata.

## Responsibilities

- fetch active moderator prompts and configs
- manage per-community enablement for fixed global label agents
- run local detector-backed moderators such as `ai-generated`
- run tool-capable moderators such as `politics-averse`, which can inspect domain trust and RSS-source topic metrics before deciding
- determine which moderators still need to run for a given content hash
- persist agent moderation results
- search historical moderation results for review tooling

## AI-Generated Content Detection

`ai-generated` reuses the same `agent_moderations` storage and queue lifecycle as the
LLM-backed moderators, but it currently uses the local Rust `is-it-slop` detector instead of an
OpenAI call.

- Threshold source: `ai_generated_confidence_threshold` in the `moderation-config` Dynamic Config namespace (editable at `/admin/dynamic-config`)
- Default threshold: `0.95`
- Stored result metadata:
  - `confidence_score`
  - `confidence_threshold`
  - `classification`
  - `detector`
  - `detector_model_version`

## Political Content Detection

`politics-averse` is an LLM-backed moderator that runs on both posts and comments through the
shared post moderation pipeline.

- Allows neutral news/event discussion
- Allows sourced political analysis
- Flags partisan persuasion, campaign-style advocacy, and unsupported political claims
- Uses the `get_domain_ratings` tool to inspect linked domain trust plus RSS-source topic ratings when the linked URL maps to a known feed
- On flag: tags `political` and moves content into the review queue

Results are stored in `agent_moderations` like other moderators and are visible through the existing admin moderation surfaces.

Moderator agents do not write public post votes. Public voting surfaces are reserved for community users without Voucha roles.

## Community AI Agent Enablement

Fixed-label moderator agents are global agent definitions. Communities toggle only whether those
global agents run for posts in that community through `community_auto_tagger_agents`.

Archived communities reject agent toggle writes.

- Default state: disabled
- Toggle actors: community owners and moderators
- Future paid-plan checks: `getCommunityAiAgentEntitlement()`
- Runtime gate: `getEnabledCommunityAutoTaggerModeratorSlugs(communityId)` before dispatch, and
  `assertCommunityAutoTaggerAgentEnabled(communityId, slug)` before an individual prompt job runs

The fixed toggle matrix is:

| Slug              | Label topics                                       |
| ----------------- | -------------------------------------------------- |
| `self-promotion`  | `self-promotion`                                   |
| `marketplace`     | `buying`, `selling`, `trade`, `for-hire`, `hiring` |
| `ai-generated`    | `ai-generated`                                     |
| `politics-averse` | `political`                                        |
| `click-bait`      | `click-bait`                                       |
| `vague-post`      | `vague-post`                                       |
| `shit-post`       | `shit-post`                                        |

## Related

- AI agents system: [../../queues/ai-agents/README.md](../../queues/ai-agents/README.md)
- Moderator agent implementation: [../../agents/moderation/README.md](../../agents/moderation/README.md)
