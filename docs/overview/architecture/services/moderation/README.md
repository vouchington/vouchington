# Moderation Service

Source entrypoint: [backend/services/moderation/README.md](../../../../../backend/services/moderation/README.md)

Business-logic helpers for moderation policy text, local detector configuration, fixed-label
community toggles, and reads of stored moderation results.

## Responsibilities

- render platform content policy for retained moderation and advice agents
- expose the `ai-generated` detector threshold from Dynamic Config
- list, enable, and disable fixed-label community toggles in `community_auto_tagger_agents`
- map fixed moderator slugs to label topics and search stored `agent_moderations` for review tooling

The shared [classifier-run lifecycle](../classifier-runs/README.md) owns durable requests, result
recording, and recovery. [Community prompt moderation](../../ai-agents/community-moderation/README.md)
loads custom prompts from [`@services/community-agent-prompts`](../../../../../backend/services/community-agent-prompts/README.md)
and records prompt results through that lifecycle.

## AI-Generated Content Detection

The C5 post classifier invokes the local Rust `is-it-slop` detector for the `ai-generated` label.
The result is stored with the classifier run and applied as a label; it uses no model provider call.

- Threshold source: `ai_generated_confidence_threshold` in the `moderation-config` Dynamic Config namespace (editable at `/admin/dynamic-config`)
- Default threshold: `0.95`
- Stored result metadata:
  - `confidence_score`
  - `confidence_threshold`
  - `classification`
  - `detector`
  - `detector_model_version`

## Political Label

`politics-averse` is a fixed post-classifier identity that can apply the `political` label when
enabled for a community. It is not a separate agent package.

Moderator agents do not write public post votes. Public voting surfaces are reserved for community users without Voucha roles.

## Community AI Agent Enablement

Fixed-label moderator identities are global. Communities toggle whether their labels apply to
posts in that community through `community_auto_tagger_agents`.

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
