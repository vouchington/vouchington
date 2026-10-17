import type { MergedToolSource } from './create-merged-tool.mts'
import { getReferralProgramAttributes } from '@services/topics'
import type { BasicUser } from '@services/users/types'
import { iso } from './mcp-read-output.mts'
import { foundOrNotFoundSchema, pickProperties } from './read-tool-output-schema.mts'
import { resolveTopic } from './resolve-topic.mts'

type ToolArgs = {
  topic_id: string
}

type ToolResult =
  | {
      success: true
      topic_id: string
      company_topic_id: string | null
      enabled_at: string | null
      disabled_at: string | null
    }
  | { success: false; error: string }

const optionalIso = (value: Date | string | null | undefined): string | null =>
  value ? iso(value) : null

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Get a referral program's state by topic UUID or slug, including its company and enabled or disabled time. An unknown topic returns Topic not found; a topic that is not a referral program returns Topic is not a referral program. Use get_referral_links for its links.",
    parameters: {
      type: 'object',
      properties: {
        topic_id: { type: 'string', description: 'Referral program topic UUID or slug' },
      },
      required: ['topic_id'],
    },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Topic Referral Program',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug/referral-program' }],
    outputSchema: foundOrNotFoundSchema({
      topic_id: { type: 'string' },
      ...pickProperties('ReferralProgramAttributes', [
        'company_topic_id',
        'enabled_at',
        'disabled_at',
      ]),
    }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = await resolveTopic(args.topic_id)
      if (!topic) return { success: false, error: 'Topic not found' }
      if (topic.topic_type !== 'referral_program') {
        return { success: false, error: 'Topic is not a referral program' }
      }
      const attributes = await getReferralProgramAttributes(topic)
      if (!attributes) return { success: false, error: 'Referral program attributes not found' }
      return {
        success: true,
        topic_id: topic.id,
        company_topic_id: attributes.company_topic_id ?? null,
        enabled_at: optionalIso(attributes.enabled_at),
        disabled_at: optionalIso(attributes.disabled_at),
      }
    },
}

export default tool
