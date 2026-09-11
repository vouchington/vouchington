import { it, expect, describe } from 'vitest'
import createWikipediaTopicRecommendationTool from '../create-wikipedia-topic-recommendation.mts'
import type { PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('create-wikipedia-topic-recommendation', () => {
  const mockUser: PrivateUser = {
    id: 'test-user-id',
    username: 'testuser',
  } as PrivateUser

  it('has correct schema', () => {
    expect(createWikipediaTopicRecommendationTool.schema).toBeDefined()
    expect(createWikipediaTopicRecommendationTool.schema.type).toBe('function')
    expect(createWikipediaTopicRecommendationTool.schema.name).toBe('create_topic_recommendation')
    const required = (
      createWikipediaTopicRecommendationTool.schema.parameters as {
        required?: string[]
      }
    )?.required
    expect(required).toContain('wikipedia_pageid')
    expect(required).toContain('wikipedia_title')
    expect(required).toContain('wikipedia_url')
    expect(required).toContain('extraction_keyword')
    expect(required).toContain('confidence')
  })

  it('schema includes all parameters', () => {
    const params = (
      createWikipediaTopicRecommendationTool.schema.parameters as {
        properties?: Record<string, unknown>
        additionalProperties?: boolean
      }
    )?.properties
    const schemaParams = createWikipediaTopicRecommendationTool.schema.parameters as {
      additionalProperties?: boolean
    }
    expect(params?.wikipedia_pageid).toBeDefined()
    expect(params?.wikipedia_title).toBeDefined()
    expect(params?.wikipedia_url).toBeDefined()
    expect(params?.wikipedia_extract).toBeDefined()
    expect(params?.wikipedia_description).toBeDefined()
    expect(params?.wikipedia_thumbnail_url).toBeDefined()
    expect(params?.extraction_keyword).toBeDefined()
    expect(params?.confidence).toBeDefined()
    expect(schemaParams.additionalProperties).toBe(false)
  })

  it('function accepts correct arguments', () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())
    expect(typeof execute).toBe('function')
  })

  it('rejects missing confidence before persistence', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    await expect(
      execute({
        wikipedia_pageid: 123,
        wikipedia_title: 'Missing Confidence Topic',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Missing_Confidence_Topic',
        extraction_keyword: 'Missing Confidence Topic',
      } as never),
    ).rejects.toThrow('confidence must be a finite number')
  })

  it('rejects non-numeric and out-of-range confidence before persistence', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())
    const baseArgs = {
      wikipedia_pageid: 123,
      wikipedia_title: 'Invalid Confidence Topic',
      wikipedia_url: 'https://en.wikipedia.org/wiki/Invalid_Confidence_Topic',
      extraction_keyword: 'Invalid Confidence Topic',
    }

    await expect(execute({ ...baseArgs, confidence: 'high' } as never)).rejects.toThrow(
      'confidence must be a finite number',
    )
    await expect(execute({ ...baseArgs, confidence: 1.1 } as never)).rejects.toThrow(
      'confidence must be a finite number between 0 and 1',
    )
  })

  it('rejects non-integer wikipedia page IDs before persistence', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    await expect(
      execute({
        wikipedia_pageid: 123.45,
        wikipedia_title: 'Fractional Page ID Topic',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Fractional_Page_ID_Topic',
        extraction_keyword: 'Fractional Page ID Topic',
        confidence: 0.8,
      }),
    ).rejects.toThrow('wikipedia_pageid must be an integer')
  })

  it('rejects non-http wikipedia URLs before persistence', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    await expect(
      execute({
        wikipedia_pageid: 123,
        wikipedia_title: 'Invalid URL Topic',
        wikipedia_url: 'mailto:tests+topic@voucha.ai',
        extraction_keyword: 'Invalid URL Topic',
        confidence: 0.8,
      }),
    ).rejects.toThrow('wikipedia_url must be an HTTP(S) URL with a hostname')
  })

  it('strips NUL bytes from wikipedia_title (does not throw validation error)', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    let result: unknown
    try {
      await execute({
        wikipedia_pageid: 42,
        wikipedia_title: 'Valid\x00Title',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Valid_Title',
        extraction_keyword: 'key\x00word',
        confidence: 0.9,
      })
    } catch (e) {
      result = e
    }

    // Should fail at DB/duplicate-check (no status or 5xx), NOT at validation (status 422)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error & { status?: number }).status).not.toBe(422)
  })

  it('rejects control-only wikipedia_title', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    await expect(
      execute({
        wikipedia_pageid: 42,
        wikipedia_title: '\x00\x01',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Test',
        extraction_keyword: 'keyword',
        confidence: 0.9,
      }),
    ).rejects.toThrow('wikipedia_title must be a non-empty string')
  })

  it('validation errors carry status 422', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    let err: unknown
    try {
      await execute({
        wikipedia_pageid: 123,
        wikipedia_title: 'Valid Title',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Valid_Title',
        extraction_keyword: 'keyword',
        confidence: 2.0, // out of range
      })
    } catch (e) {
      err = e
    }

    expect(err).toBeInstanceOf(Error)
    expect((err as Error & { status?: number }).status).toBe(422)
  })

  it('rejects non-string optional field with status 422', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    let caughtErr: unknown
    try {
      await execute({
        wikipedia_pageid: 123,
        wikipedia_title: 'Valid Title',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Valid_Title',
        extraction_keyword: 'keyword',
        confidence: 0.8,
        wikipedia_extract: 42 as never,
      })
    } catch (e) {
      caughtErr = e
    }

    expect(caughtErr).toBeInstanceOf(Error)
    expect((caughtErr as Error & { status?: number }).status).toBe(422)
  })

  it('passes validation with valid optional string fields (covers readOptionalString return path)', async () => {
    const execute = createWikipediaTopicRecommendationTool.function(mockUser, 'post', randomUUID())

    let caughtErr: unknown
    try {
      await execute({
        wikipedia_pageid: 123,
        wikipedia_title: 'Valid Title',
        wikipedia_url: 'https://en.wikipedia.org/wiki/Valid_Title',
        extraction_keyword: 'keyword',
        confidence: 0.8,
        wikipedia_extract: 'Some extract text',
        wikipedia_description: 'Some description',
      })
    } catch (e) {
      caughtErr = e
    }

    // Validation passes; any error comes from the DB layer (not status 422)
    expect((caughtErr as { status?: number } | undefined)?.status).not.toBe(422)
  })
})
