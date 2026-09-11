# @services/community-agent-prompt-audit

Provides audit trail recording for community agent prompt changes made by moderators.

## What It Does

Records every change to a community agent prompt into the `community_agent_prompt_changes`
Postgres table, enabling full change history with who changed what and when.

## Data Model

- **community_agent_prompt_changes** — append-only audit log. Each row captures the
  `agent_prompt_id` (no FK so history survives hard-deletes), `community_id`,
  `changed_by_id` (moderator user ID, SET NULL on deletion), `action` enum,
  and snapshots of `previous_fields` and `next_fields` as JSONB.

## Key Functions

| Module         | Functions                          |
| -------------- | ---------------------------------- |
| `record.mts`   | `recordCommunityAgentPromptChange` |
| `snapshot.mts` | `snapshotCommunityAgentPrompt`     |

## Usage

Call `recordCommunityAgentPromptChange` after each mutation in `@services/community-agent-prompts`.
Use `snapshotCommunityAgentPrompt` to build the before/after snapshots.

```ts
import {
  recordCommunityAgentPromptChange,
  snapshotCommunityAgentPrompt,
} from '@services/community-agent-prompt-audit'

const prev = snapshotCommunityAgentPrompt(existing)
const next = snapshotCommunityAgentPrompt(updated)
await recordCommunityAgentPromptChange(userId, communityId, promptId, 'updated', prev, next)
```

## Related

- Migration: `backend/data-stores/psql/migrations/0410-00-00-community-agent-prompt-changes.sql`
- Community agent prompts service: `backend/services/community-agent-prompts/`
- Services guide: [../CLAUDE.md](../CLAUDE.md)
