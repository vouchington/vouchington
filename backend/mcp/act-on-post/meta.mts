import type {
  ToolApiEndpoint,
  ToolMeta,
  ToolOutputSchema,
} from '@services/openai-agents/tool-types'
import { POST_WRITE_SCOPES } from '../post-write-tool-support.mts'
import { postReferenceSchema } from '../entity-reference-schema.mts'

/** The post id or slug of a post the caller can read; the REST twin resolves either form. */
export const POST_TARGET_SCHEMA = postReferenceSchema

/**
 * Every `act_on_post` option shares these declared gates. The hints are the most conservative
 * the options need, so read state and ratings are not advertised as idempotent or non-destructive.
 */
export function postActionMeta(api: ToolApiEndpoint[], outputSchema: ToolOutputSchema): ToolMeta {
  return {
    audience: 'user',
    title: 'Act on Post',
    plan: 'plus',
    requiredScopes: POST_WRITE_SCOPES,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api,
    outputSchema,
  }
}
