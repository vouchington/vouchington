import { retractEntityRelationVote } from '@services/elections-votes/entity-relation'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { requireActiveToolUser } from './private-user.mts'

type ToolArgs = { id: string }

const tool: Tool<ToolArgs, { success: true }> = {
  schema: {
    name: 'withdraw_entity_relation_vote',
    type: 'function',
    description:
      "Withdraw the current user's own confirm or dispute vote on an entity relation, such as a tag or a user tag. Withdrawing a vote the user never cast, or already withdrew, changes nothing and still succeeds. An unknown relation fails as not found. This only removes the caller's own vote: it never casts or changes one, and it never touches anyone else's vote.",
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'The ID of the entity relation.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Withdraw Entity Relation Vote',
    plan: 'plus',
    requiredScopes: { mcp: ['entity-relations:read', 'entity-relations:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    api: [{ method: 'DELETE', path: '/api/v1/entity-relations/:id/vote' }],
    outputSchema: successSchema({}),
  },
  function: (currentUser: BasicUser) => async (args: ToolArgs) => {
    const user = await requireActiveToolUser(currentUser)
    await retractEntityRelationVote(user.id, args.id)
    return { success: true }
  },
}

export default tool
