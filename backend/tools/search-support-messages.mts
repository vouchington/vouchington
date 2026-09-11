import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { searchSupportMessagesForRag } from '@services/customer-support'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  query: string
  limit?: number
}

type ToolResult = {
  success: true
  results: Array<{
    id: string
    thread_subject: string
    contact_name: string
    direction: string
    body_text: string
    created_at: string
  }>
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_support_messages',
    type: 'function',
    description:
      'Search past customer support messages for relevant context. Use this to find how similar issues were handled before.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant support messages',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 10)',
        },
      },
      required: ['query'],
    },
    strict: null,
  },
  roles: {
    administrator: true,
    customer_support: true,
    user: false,
  },
  meta: { surfaces: ['internal', 'admin_mcp'], annotations: { readOnlyHint: true }, api: null },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const limit = clampToolLimit(args.limit, 5, 10)
      const results = await searchSupportMessagesForRag(args.query, { limit })
      return {
        success: true,
        results: await Promise.all(
          results.map(async result => ({
            id: result.id,
            thread_subject: await sanitizePromptInjection(result.thread_subject, { isTitle: true }),
            contact_name: await sanitizePromptInjection(result.contact_name, { isTitle: true }),
            direction: result.direction,
            body_text: wrapExternalContent(await sanitizePromptInjection(result.body_text), {
              source: 'user_message',
              contentType: 'user_message',
            }),
            created_at: result.created_at.toISOString(),
          })),
        ),
      }
    },
}

export default tool
