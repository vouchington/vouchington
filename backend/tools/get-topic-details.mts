import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicByAny } from '@services/topics/get'
import { getCardAttributes } from '@services/topics/cards'
import { getRewardsProgramAttributes } from '@services/topics/rewards-programs'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import type { Money } from '@ts-shared/money'

type ToolArgs = {
  topic_id: string
}

type ToolResult =
  | {
      success: true
      id: string
      name: string
      slug: string
      topic_type: string
      markdown: string
      aliases: string[]
      annual_fee?: Money | null
      bank_name?: string | null
      brand_name?: string | null
      rewards_program_company?: string | null
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_topic_details',
    type: 'function',
    description:
      'Get detailed information about a topic (card, bank account, rewards program, etc.). For cards, returns the annual fee, issuing bank, and card brand. For rewards programs, returns the parent company. Always includes the full description and aliases.',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic UUID or slug to retrieve details for',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = await getTopicByAny(args.topic_id)

      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      const base = {
        success: true as const,
        id: topic.id,
        name: topic.name,
        slug: topic.slug,
        topic_type: topic.topic_type,
        markdown: topic.markdown,
        aliases: topic.aliases,
      }

      if (topic.topic_type === 'card') {
        const cardAttrs = await getCardAttributes(topic)

        // Resolve bank and brand IDs to names
        const idsToResolve: string[] = []
        if (cardAttrs?.bank_id) idsToResolve.push(cardAttrs.bank_id)
        if (cardAttrs?.brand_id) idsToResolve.push(cardAttrs.brand_id)

        let bankName: string | null = null
        let brandName: string | null = null

        if (idsToResolve.length > 0) {
          const resolved = await getTopicsByAnyBatch(idsToResolve)
          let idx = 0
          if (cardAttrs?.bank_id) {
            bankName = resolved[idx]?.name ?? null
            idx++
          }
          if (cardAttrs?.brand_id) {
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
        if (rewardsAttrs?.company_id) {
          const [resolved] = await getTopicsByAnyBatch([rewardsAttrs.company_id])
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
