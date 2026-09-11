import {
  createRecommendation,
  checkDuplicateTopic,
} from '@services/wikipedia-topic-recommendations'
import { createSlugFromTitle } from '@modules/utils/slugs'
import { stripControlCharacters } from '@modules/utils'
import { toTitleCase } from '@ts-shared/utils/strings'
import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import assert from 'http-assert'
type ToolArgs = {
  wikipedia_pageid: number // LLM sends as number, converted to string for TEXT in PostgreSQL
  wikipedia_title: string
  wikipedia_url: string
  wikipedia_extract?: string | null
  wikipedia_description?: string | null
  wikipedia_thumbnail_url?: string | null
  extraction_keyword: string
  confidence: number
}
type ToolResult =
  | {
      created: false
      reason: string
      message: string
    }
  | {
      created: true
      recommendation_id: string
      suggested_topic_name: string
      suggested_topic_slug: string
    }
const tool: Tool<ToolArgs, ToolResult, ['post', string]> = {
  schema: {
    name: 'create_topic_recommendation',
    type: 'function',
    description:
      'Creates a Wikipedia-backed topic recommendation for the current content. This saves a post-backed recommendation request for admin review. Only call this for topics that are directly relevant to the main subject matter of the content. Check for duplicates before creating.',
    parameters: {
      type: 'object',
      properties: {
        wikipedia_pageid: {
          type: 'number',
          description: 'The Wikipedia page ID from the summary',
        },
        wikipedia_title: {
          type: 'string',
          description: 'The Wikipedia article title',
        },
        wikipedia_url: {
          type: 'string',
          description: 'The Wikipedia article URL',
        },
        wikipedia_extract: {
          type: 'string',
          description: 'The Wikipedia article extract/summary text',
        },
        wikipedia_description: {
          type: 'string',
          description: 'The Wikipedia article short description',
        },
        wikipedia_thumbnail_url: {
          type: 'string',
          description: 'The Wikipedia article thumbnail image URL',
        },
        extraction_keyword: {
          type: 'string',
          description: 'The keyword or phrase that led to finding this topic',
        },
        confidence: {
          type: 'number',
          description:
            'Confidence score (0.0-1.0) indicating how relevant this topic is to the content',
          minimum: 0,
          maximum: 1,
        },
      },
      additionalProperties: false,
      required: [
        'wikipedia_pageid',
        'wikipedia_title',
        'wikipedia_url',
        'extraction_keyword',
        'confidence',
      ],
    },
    strict: null,
  },
  meta: { surfaces: ['internal'], annotations: { destructiveHint: true }, api: null },
  function:
    (currentUser: BasicUser, entityType: 'post', entityId: string) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const normalizedArgs = normalizeToolArgs(args)
      const duplicateCheck = await checkDuplicateTopic(
        normalizedArgs.wikipedia_title,
        normalizedArgs.wikipedia_url,
        normalizedArgs.wikipedia_pageid.toString(),
      )
      if (duplicateCheck.is_duplicate) {
        return {
          created: false,
          reason: 'duplicate',
          message: duplicateCheck.reason ?? 'Topic or recommendation already exists',
        }
      }
      const topicName = toTitleCase(normalizedArgs.wikipedia_title)
      const topicSlug = createSlugFromTitle(normalizedArgs.wikipedia_title)
      const recommendation = await createRecommendation(currentUser, {
        source_entity_type: entityType,
        source_entity_id: entityId,
        wikipedia_pageid: normalizedArgs.wikipedia_pageid.toString(), // Convert to string for TEXT in PostgreSQL
        wikipedia_title: normalizedArgs.wikipedia_title,
        wikipedia_url: normalizedArgs.wikipedia_url,
        wikipedia_extract: normalizedArgs.wikipedia_extract,
        wikipedia_description: normalizedArgs.wikipedia_description,
        wikipedia_thumbnail_url: normalizedArgs.wikipedia_thumbnail_url,
        suggested_topic_name: topicName,
        suggested_topic_slug: topicSlug,
        extraction_method: 'llm_extraction',
        extraction_keyword: normalizedArgs.extraction_keyword,
        extraction_confidence: normalizedArgs.confidence,
      })
      if (!recommendation) {
        return {
          created: false,
          reason: 'duplicate',
          message: 'A recommendation for this content + Wikipedia page combination already exists',
        }
      }
      return {
        created: true,
        recommendation_id: recommendation.id,
        suggested_topic_name: topicName,
        suggested_topic_slug: topicSlug,
      }
    },
}
export default tool
function normalizeToolArgs(args: unknown): ToolArgs {
  if (!isRecord(args)) {
    throw new TypeError('Invalid create_topic_recommendation arguments: expected an object')
  }
  const wikipediaPageId = readFiniteNumber(args, 'wikipedia_pageid')
  if (!Number.isInteger(wikipediaPageId)) {
    throw new TypeError('wikipedia_pageid must be an integer')
  }
  const wikipediaUrl = readRequiredString(args, 'wikipedia_url')
  let parsedWikipediaUrl: URL
  try {
    parsedWikipediaUrl = new URL(wikipediaUrl)
  } catch {
    throw new TypeError('wikipedia_url must be a valid URL')
  }
  if (!['http:', 'https:'].includes(parsedWikipediaUrl.protocol) || !parsedWikipediaUrl.hostname) {
    throw new TypeError('wikipedia_url must be an HTTP(S) URL with a hostname')
  }
  return {
    wikipedia_pageid: wikipediaPageId,
    wikipedia_title: readRequiredString(args, 'wikipedia_title'),
    wikipedia_url: wikipediaUrl,
    wikipedia_extract: readOptionalString(args, 'wikipedia_extract'),
    wikipedia_description: readOptionalString(args, 'wikipedia_description'),
    wikipedia_thumbnail_url: readOptionalString(args, 'wikipedia_thumbnail_url'),
    extraction_keyword: readRequiredString(args, 'extraction_keyword'),
    confidence: readConfidence(args),
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function readRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  assert(typeof value === 'string', 422, `${key} must be a non-empty string`)
  const stripped = stripControlCharacters(value).trim()
  assert(stripped.length > 0, 422, `${key} must be a non-empty string`)
  return stripped
}

function readOptionalString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key]
  if (value == null) return null
  assert(typeof value === 'string', 422, `${key} must be a string when provided`)
  return stripControlCharacters(value).trim() || null
}

function readFiniteNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  assert(typeof value === 'number' && Number.isFinite(value), 422, `${key} must be a finite number`)
  return value
}

function readConfidence(args: Record<string, unknown>): number {
  const confidence = readFiniteNumber(args, 'confidence')
  assert(
    confidence >= 0 && confidence <= 1,
    422,
    'confidence must be a finite number between 0 and 1',
  )
  return confidence
}
