import type { BasicUser } from '@services/users/types'
import type { Tool } from '@services/openai-agents/tool-types'
import { attachTopicProvenance } from '@services/content-provenance'
import { getTopicByAny } from '@services/topics/get'
import { getCardAttributes } from '@services/topics/cards'
import { getRewardsProgramAttributes } from '@services/topics/rewards-programs'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import type { Topic } from '@services/topics/types'
import type { Money } from '@ts-shared/money'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import { nullable, outcomeSchema } from './output-schema-shapes.mts'
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
    ...HIERARCHY_OUTPUT_PROPERTIES,
  },
  [
    'provenance',
    'annual_fee',
    'bank_name',
    'brand_name',
    'rewards_program_company',
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
    } & TopicHierarchyResult)
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_topic_details',
    type: 'function',
    description:
      'Get detailed information about a topic (card, bank account, rewards program, etc.). For cards, returns the annual fee, issuing bank, and card brand. For rewards programs, returns the parent company. Always includes the full description and aliases. Set hierarchy to also get parent topics (the organization that issues a card) and/or child topics (all cards a bank issues, all tiers in a rewards program); children come one page at a time, so pass children_page_info.end_cursor as children_after for the next page.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic UUID or slug to retrieve details for',
        },
        ...HIERARCHY_ARGUMENT_PROPERTIES,
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get Topic Details',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const [topic] = await attachTopicProvenance([await getTopicByAny(args.topic_id)], null)

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
          const resolved = await getTopicsByAnyBatch(idsToResolve)
          let idx = 0
          if (cardAttrs?.bank_topic_id) {
            bankName = resolved[idx]?.name ?? null
            idx++
          }
          if (cardAttrs?.brand_topic_id) {
            brandName = resolved[idx]?.name ?? null
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
          const [resolved] = await getTopicsByAnyBatch([rewardsAttrs.company_topic_id])
          companyName = resolved?.name ?? null
        }

        return {
          ...base,
          rewards_program_company: companyName,
        }
      }

      return base
    },
}

export default tool
