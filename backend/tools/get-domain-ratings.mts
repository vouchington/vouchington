import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import onError from '@modules/on-error'
import {
  getRatingsForHostname,
  getRatingsForUrl,
  type ToolResult,
} from './get-domain-ratings-helpers.mts'

type ToolArgs = {
  url?: string
  hostname?: string
}

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_domain_ratings',
    type: 'function',
    description:
      'Look up trust signals for a linked source. Returns hostname/domain trust votes and, when a URL maps to an RSS source, the associated source topic ratings and metrics.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'A fully-qualified URL to inspect',
        },
        hostname: {
          type: 'string',
          description: 'A bare hostname/domain to inspect, such as example.com',
        },
      },
      additionalProperties: false,
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    requiredScopes: { mcp: ['domain-ratings:read'] },
    annotations: { readOnlyHint: true },
    api: null,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const hasUrl = typeof args.url === 'string' && args.url.trim().length > 0
      const hasHostname = typeof args.hostname === 'string' && args.hostname.trim().length > 0

      if (hasUrl === hasHostname) {
        return {
          success: false,
          error: 'Provide exactly one of url or hostname.',
        }
      }

      try {
        if (hasUrl) {
          return await getRatingsForUrl(args.url!.trim())
        }

        return await getRatingsForHostname(args.hostname!.trim().toLowerCase())
      } catch (error: unknown) {
        if (error instanceof Error) onError(error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to look up domain ratings.',
        }
      }
    },
}

export default tool
