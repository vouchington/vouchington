# Moderation Service

Source entrypoint: [backend/services/moderation/README.md](../../../../../backend/services/moderation/README.md)

Business-logic helpers for post-moderation agents, moderation prompt retrieval, and persisted moderation result metadata.

## Responsibilities

- fetch active moderator prompts and configs
- manage per-community enablement for fixed global label agents
- run local detector-backed moderators such as `ai-generated`
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

`politics-averse` is a fixed-label built-in agent that applies to both posts and comments. It is
a label of the post classifier catalog, not a separate agent package: the classifier asks a
single-question policy for it and gets no tools.

- Allows neutral news/event discussion
- Allows sourced political analysis
- Flags partisan persuasion, campaign-style advocacy, and unsupported political claims
- On flag: labels the content `political`

Moderator agents do not write public post votes. Public voting surfaces are reserved for community users without Voucha roles.

## Community AI Agent Enablement

Fixed-label moderator agents are global agent definitions. Communities toggle only whether those
global agents run for posts in that community through `community_auto_tagger_agents`.

Archived communities reject agent toggle writes.

- Default state: disabled
- Toggle actors: community owners and moderators
- Future paid-plan checks: `getCommunityAiAgentEntitlement()`
- Runtime read: the post classifier reads a community's toggle rows through
  `getCurrentPostClassifierLabelToggles` when it builds the label configuration; this package owns
  only the list, enable, and disable surfaces

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
- Community moderation agent: [../../ai-agents/community-moderation/README.md](../../ai-agents/community-moderation/README.md)
