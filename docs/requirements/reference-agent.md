# `agent`

[Back to Admin Navigation Matrix reference](reference-admin-navigation-matrix-table-b-entity-action-description.md#agent)

| Action            | Description                                                               | Route                               | File path                                                      | Navigation path(s)                                |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| List Agents       | Browse all agents with cursor-based infinite scroll.                      | `/agents`                           | `web/app/(agents)/agents/page.tsx`                             | sidebar: CMS → Agents; command: Agents            |
| View Agent        | View agent detail; search conversations by post ID, RSS item ID, or user. | `/agent/:idOrSlug`                  | `web/app/(agents)/agent/[idOrSlug]/page.tsx`                   | inline: from `/agents` row                        |
| View Conversation | Read full conversation transcript for an agent run.                       | `/agent/:idOrSlug/conversation/:id` | `web/app/(agents)/agent/[idOrSlug]/conversation/[id]/page.tsx` | inline: from `/agent/:idOrSlug` conversation list |
