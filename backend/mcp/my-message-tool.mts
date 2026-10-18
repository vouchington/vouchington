import { Buffer } from 'node:buffer'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { ToolApiEndpoint } from '@services/openai-agents/tool-types'
import type { MergedToolSource } from './create-merged-tool.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { routeResponseSchema } from './route-response-schema.mts'
import { successSchema } from './output-schema-shapes.mts'

export type PageArgs = { limit?: number; after?: string }
export type ConversationArgs = PageArgs & { conversation_id: string }
export type CreateArgs = { user_id: string } | { user_ids: string[] }
export type SendArgs = { conversation_id: string; text: string }
export type ParticipantArgs = { conversation_id: string; user_id: string }
export type PolicyArgs = {
  conversation_id: string
  participant_add_policy: 'owner_only' | 'all_members'
}
export const uuid = { type: 'string', format: 'uuid' }
export const pageProperties = {
  limit: {
    type: 'integer',
    description: 'Page size; uses the REST default and maximum.',
  },
  after: { type: 'string', description: 'Opaque cursor from this option’s previous page.' },
}
export const conversationProperties = { conversation_id: uuid }
export const path = (args: { conversation_id: string }) => ({
  conversationId: args.conversation_id,
})
export const page = (args: PageArgs) => ({
  ...(args.limit !== undefined ? { limit: args.limit } : {}),
  ...(args.after !== undefined ? { after: args.after } : {}),
})
// The merged envelope has already validated the request. Commands retain REST's validation order.
export const validated = () => {}
export const ROOT = '/api/v1/my/messages'

export function source<TArgs>(
  description: string,
  api: ToolApiEndpoint,
  properties: Record<string, unknown>,
  required: string[],
  execute: (currentUser: PrivateUser, args: TArgs) => Promise<unknown>,
  write = false,
  parameters?: Record<string, unknown>,
): MergedToolSource<TArgs> {
  return {
    schema: {
      description,
      parameters: parameters ?? {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
    meta: {
      audience: 'user',
      title: write ? 'Manage My Messages' : 'Read My Messages',
      ...(write ? { plan: 'plus' as const } : { suspendedAccess: 'free' as const }),
      requiredScopes: write ? ['messages:read', 'messages:write'] : ['messages:read'],
      annotations: write
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
        : { readOnlyHint: true },
      api: [api],
      outputSchema: api.method === 'DELETE' ? successSchema({}) : routeResponseSchema(api),
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requirePrivateToolUser(currentUser)
      if (write) getDelegatedToolAuthority(user, invocationContext)
      return execute(user, args)
    },
  }
}

export async function readMessageBody<T>(body: T): Promise<T> {
  assert(
    Buffer.byteLength(JSON.stringify(body), 'utf8') <= 10 * 1024,
    413,
    'Request entity too large',
  )
  return body
}
