import type { PrivateUser } from '@services/users/types'
import type { ToolApiEndpoint, ToolAnnotations } from '@services/openai-agents/tool-types'
import {
  getTopicClaimState,
  type TopicClaim,
  type TopicClaimState,
} from '@services/topic-claims/config'
import type { MergedToolSource } from '../create-merged-tool.mts'
import { requireActiveToolUser, requirePrivateToolUser } from '../private-user.mts'
import { routeResponseSchema } from '../route-response-schema.mts'

const readAnnotations = { readOnlyHint: true } as const satisfies ToolAnnotations
const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const satisfies ToolAnnotations

export function claimWithState(claim: TopicClaim): TopicClaim & { state: TopicClaimState } {
  return { ...claim, state: getTopicClaimState(claim) }
}

export function topicClaimSource<TArgs>(
  description: string,
  api: ToolApiEndpoint,
  properties: Record<string, unknown>,
  required: string[],
  execute: (currentUser: PrivateUser, args: TArgs) => Promise<unknown>,
  write: boolean,
): MergedToolSource<TArgs> {
  return {
    schema: {
      description,
      parameters: {
        type: 'object',
        properties,
        required,
        additionalProperties: false,
      },
    },
    meta: {
      audience: 'brand',
      title: write ? 'Manage Topic Claim' : 'Read My Topic Claims',
      requiredScopes: write ? ['topic-claims:read', 'topic-claims:write'] : ['topic-claims:read'],
      annotations: write ? writeAnnotations : readAnnotations,
      api: [api],
      outputSchema: routeResponseSchema(api),
    },
    function: currentUser => async args => {
      const user = write
        ? await requireActiveToolUser(currentUser)
        : await requirePrivateToolUser(currentUser)
      return execute(user, args)
    },
  }
}
