import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { attachTopicProvenance } from '@services/content-provenance'
import { resolveTopic } from './resolve-topic.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { getCardAttributes } from '@services/topics/cards'
import { getReferralProgramAttributes } from '@services/topics'
import { getRewardsProgramAttributes } from '@services/topics/rewards-programs'
import { iso } from './mcp-read-output.mts'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import type { Topic } from '@services/topics/types'
import type { Money } from '@ts-shared/money'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { nullable, outcomeSchema } from '@vouchington/mcp-server/schema'
import { componentPropertySchema, componentSchema } from './route-response-schema.mts'
import {
  getTopicHierarchyResult,
  HIERARCHY_ARGUMENT_PROPERTIES,
  HIERARCHY_OUTPUT_FIELDS,
  HIERARCHY_OUTPUT_PROPERTIES,
  type TopicHierarchyArgs,
  type TopicHierarchyResult,
} from './topic-hierarchy-result.mts'

// The REST twin streams an untyped body, so the tool owns this schema. The fields it shares with
// the documented topic come from that component; the attribute fields appear per topic type.
const nullableName = nullable({ type: 'string' })
const OUTPUT_SCHEMA = outcomeSchema(
  'success',
  {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    topic_type: componentPropertySchema('TopicBasic', 'topic_type'),
    markdown: { type: 'string' },
    aliases: componentPropertySchema('TopicBasic', 'aliases'),
    provenance: componentPropertySchema('TopicBasic', 'provenance'),
    annual_fee: nullable(componentSchema('Money')),
    bank_name: nullableName,
    brand_name: nullableName,
    rewards_program_company: nullableName,
    company_topic_id: nullableName,
    enabled_at: nullable({ type: 'string' }),
    disabled_at: nullable({ type: 'string' }),
    ...HIERARCHY_OUTPUT_PROPERTIES,
  },
  [
    'provenance',
    'annual_fee',
    'bank_name',
    'brand_name',
    'rewards_program_company',
    'company_topic_id',
    'enabled_at',
    'disabled_at',
    ...HIERARCHY_OUTPUT_FIELDS,
  ],
)

type ToolArgs = TopicHierarchyArgs & {
  topic_id: string
}

type ToolResult =
  | ({
      success: true
      id: string
      name: string
      slug: string
      topic_type: string
      markdown: string
      aliases: string[]
      /** The public provenance facts of an API or MCP topic; never the staff detail. */
      provenance?: Topic['provenance']
      annual_fee?: Money | null
      bank_name?: string | null
      brand_name?: string | null
      rewards_program_company?: string | null
      company_topic_id?: string | null
      enabled_at?: string | null
      disabled_at?: string | null
    } & TopicHierarchyResult)
  | {
      success: false
      error: string
    }

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description: 'Aliases, hierarchy and per-type fields.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: topicReferenceSchema,
        ...HIERARCHY_ARGUMENT_PROPERTIES,
      },
      required: ['topic_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get Topic Details',
    requiredScopes: ['topics:read'],
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const resolved = await resolveTopic(args.topic_id)
      if (!resolved) return { success: false, error: 'Topic not found' }
      const [topic] = await attachTopicProvenance([resolved], null)

      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      const base = {
        success: true as const,
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        topic_type: topic.topic_type,
        markdown: wrapExternalContent(await sanitizePromptInjection(topic.markdown), {
          source: 'user_content',
          contentType: 'topic',
        }),
        aliases: topic.aliases,
        ...(topic.provenance && { provenance: topic.provenance }),
        ...(await getTopicHierarchyResult(topic.id, args)),
      }

      if (topic.topic_type === 'card') {
        const cardAttrs = await getCardAttributes(topic)

        // Resolve bank and brand IDs to names
        const idsToResolve: string[] = []
        if (cardAttrs?.bank_topic_id) idsToResolve.push(cardAttrs.bank_topic_id)
        if (cardAttrs?.brand_topic_id) idsToResolve.push(cardAttrs.brand_topic_id)

        let bankName: string | null = null
        let brandName: string | null = null

        if (idsToResolve.length > 0) {
          const resolvedTopics = await getTopicsByAnyBatch(idsToResolve)
          let idx = 0
          if (cardAttrs?.bank_topic_id) {
            bankName = resolvedTopics[idx]?.name ?? null
            idx++
          }
          if (cardAttrs?.brand_topic_id) {
            brandName = resolvedTopics[idx]?.name ?? null
          }
        }

        return {
          ...base,
          annual_fee: cardAttrs?.annual_fee ?? null,
          bank_name: bankName,
          brand_name: brandName,
        }
      }

      if (topic.topic_type === 'rewards_program') {
        const rewardsAttrs = await getRewardsProgramAttributes(topic)

        let companyName: string | null = null
        if (rewardsAttrs?.company_topic_id) {
          const [companyTopic] = await getTopicsByAnyBatch([rewardsAttrs.company_topic_id])
          companyName = companyTopic?.name ?? null
        }

        return {
          ...base,
          rewards_program_company: companyName,
        }
      }

      if (topic.topic_type === 'referral_program') {
        const attributes = await getReferralProgramAttributes(topic)
        return {
          ...base,
          company_topic_id: attributes?.company_topic_id ?? null,
          enabled_at: attributes?.enabled_at ? iso(attributes.enabled_at) : null,
          disabled_at: attributes?.disabled_at ? iso(attributes.disabled_at) : null,
        }
      }

      return base
    },
}

export default tool
