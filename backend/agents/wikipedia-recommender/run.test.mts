import { describe, expect, it } from 'vitest'
import { APIError } from 'openai'
import type { RunToolLoopConfig, RunToolLoopResult } from '@agents/_shared/run-tool-loop'
import type { OpenAIFunctionCall } from '@services/openai-agents'
import type { BasicUser } from '@services/users/types'
import { DEFAULT_AGENT_MODEL } from '@agents/_shared'
import { recommendTopicsForContent } from './run.mts'

describe('recommendTopicsForContent', () => {
  const recommenderUser = {
    __entity_type: 'user',
    id: '00000000-0000-7000-8000-000000000001',
    username: 'wikipedia-recommender',
  } as BasicUser

  function createToolCall(name: string): OpenAIFunctionCall {
    return { name } as OpenAIFunctionCall
  }

  function createToolLoopResult(iterations: number): RunToolLoopResult {
    return {
      text: null,
      iterations,
      terminationReason: 'no_tool_calls',
      lastResponseId: `response-${iterations}`,
    }
  }

  it('aggregates recommendations, duplicate skips, and iterations across fetched posts', async () => {
    const configs: RunToolLoopConfig[] = []

    const stats = await recommendTopicsForContent('post', ['post-1', 'post-2'], {
      getSystemUserByUsername: username => {
        expect(username).toBe('wikipedia-recommender')
        return Promise.resolve(recommenderUser)
      },
      getPosts: ids => {
        expect(ids).toEqual(['post-1', 'post-2'])
        return Promise.resolve([
          {
            id: 'post-1',
            title: 'First title',
            content: 'First English content.',
            communityId: '00000000-0000-7000-8000-000000000002',
          },
          {
            id: 'post-2',
            title: 'Second title',
            content: 'Second English content.',
            communityId: null,
          },
        ])
      },
      runToolLoop: config => {
        configs.push(config)
        expect(config.model).toBe(DEFAULT_AGENT_MODEL)
        expect(config.maxIterations).toBe(10)
        expect(config.safetyIdentifier).toBe(recommenderUser.id)
        expect(config.extraParams).toMatchObject({
          service_tier: 'flex',
          prompt_cache_key: 'wikipedia-recommender-v1',
        })
        expect(config.metadata).toEqual({
          type: 'wikipedia_recommender',
          entity_id: configs.length === 1 ? 'post-1' : 'post-2',
          entity_type: 'post',
        })
        expect(config.input).toContain(configs.length === 1 ? 'First title' : 'Second title')
        expect(config.communityId).toBe(
          configs.length === 1 ? '00000000-0000-7000-8000-000000000002' : null,
        )

        config.onAfterCall?.(createToolCall('create_topic_recommendation'), { created: true })
        if (configs.length === 1) {
          config.onAfterCall?.(createToolCall('create_topic_recommendation'), { created: false })
          return Promise.resolve(createToolLoopResult(3))
        }
        return Promise.resolve(createToolLoopResult(2))
      },
    })

    expect(stats).toEqual({
      processed: 2,
      recommendations_created: 2,
      duplicates_skipped: 1,
      iterations: 5,
    })
    expect(configs).toHaveLength(2)
  })

  it('stops create-topic tool calls after the recommendation cap', async () => {
    const stats = await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: config => {
        const createCall = createToolCall('create_topic_recommendation')
        for (let i = 0; i < 5; i++) {
          expect(config.onBeforeCall?.(createCall)).toBeUndefined()
          config.onAfterCall?.(createCall, { created: true })
        }

        expect(
          config.onIteration?.({
            iterations: 2,
            response: {} as Parameters<
              NonNullable<RunToolLoopConfig['onIteration']>
            >[0]['response'],
            toolCalls: [createCall],
          }),
        ).toEqual({ stop: true, reason: 'max_recommendations' })
        expect(config.onBeforeCall?.(createCall)).toEqual({
          skip: true,
          skipResult: { skipped: true, reason: 'max_recommendations_reached' },
        })
        return Promise.resolve(createToolLoopResult(2))
      },
    })

    expect(stats).toMatchObject({
      processed: 1,
      recommendations_created: 5,
      duplicates_skipped: 0,
      iterations: 2,
    })
  })

  it('onIteration returns undefined to continue when under the recommendation cap', async () => {
    const stats = await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: config => {
        expect(
          config.onIteration?.({
            iterations: 1,
            response: {} as Parameters<
              NonNullable<RunToolLoopConfig['onIteration']>
            >[0]['response'],
            toolCalls: [],
          }),
        ).toBeUndefined()
        return Promise.resolve(createToolLoopResult(1))
      },
    })

    expect(stats).toMatchObject({ processed: 1, iterations: 1 })
  })

  it('onAfterCall reports an error for a malformed create_topic_recommendation output', async () => {
    const stats = await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: config => {
        config.onAfterCall?.(createToolCall('create_topic_recommendation'), 'not-an-object')
        return Promise.resolve(createToolLoopResult(1))
      },
    })

    expect(stats).toMatchObject({ recommendations_created: 0, duplicates_skipped: 0 })
  })

  it('does not call the tool loop when no posts are returned', async () => {
    let calledToolLoop = false

    const stats = await recommendTopicsForContent('post', ['missing-post'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () => Promise.resolve([]),
      runToolLoop: () => {
        calledToolLoop = true
        return Promise.resolve(createToolLoopResult(1))
      },
    })

    expect(stats).toEqual({
      processed: 0,
      recommendations_created: 0,
      duplicates_skipped: 0,
      iterations: 0,
    })
    expect(calledToolLoop).toBe(false)
  })

  it('rejects unsupported entity types before fetching content', async () => {
    let fetchedContent = false

    await expect(
      recommendTopicsForContent('rss_feed_item' as 'post', ['item-1'], {
        getSystemUserByUsername: () => Promise.resolve(recommenderUser),
        getPosts: () => {
          fetchedContent = true
          return Promise.resolve([])
        },
      }),
    ).rejects.toThrow('Only post entity type is currently supported')
    expect(fetchedContent).toBe(false)
  })

  it('fails when the wikipedia recommender system user is missing', async () => {
    await expect(
      recommendTopicsForContent('post', ['post-1'], {
        getSystemUserByUsername: () => Promise.resolve(null),
        getPosts: () =>
          Promise.resolve([
            { id: 'post-1', title: 'Title', content: 'Content', communityId: null },
          ]),
      }),
    ).rejects.toThrow('Wikipedia recommender system user not found')
  })

  it('onCallError enriches error with tool/entity context', async () => {
    let capturedErr: Error | undefined

    await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: config => {
        const err = new Error('tool failed')
        capturedErr = err
        config.onCallError?.(createToolCall('search_wikipedia'), err)
        return Promise.resolve(createToolLoopResult(1))
      },
    })

    expect(capturedErr).toBeDefined()
    const extendedErr = capturedErr as Error & {
      tags?: Record<string, string | number | boolean>
      extra?: Record<string, unknown>
    }
    expect(extendedErr.tags).toMatchObject({
      tool_name: 'search_wikipedia',
      entity_type: 'post',
    })
    expect(extendedErr.extra).toMatchObject({ entity_id: 'post-1' })
  })

  it('skips item and resolves when runToolLoop rejects with an OpenAI 5xx error', async () => {
    const serverError = new APIError(
      500,
      { message: 'Internal Server Error' },
      'test',
      new Headers(),
    )

    const stats = await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: () => Promise.reject(serverError),
    })

    expect(stats).toEqual({
      processed: 1,
      recommendations_created: 0,
      duplicates_skipped: 0,
      iterations: 0,
    })
  })

  it('reports unknown errors via onError instead of throwing or silently skipping', async () => {
    const genericError = new Error('boom')

    const stats = await recommendTopicsForContent('post', ['post-1'], {
      getSystemUserByUsername: () => Promise.resolve(recommenderUser),
      getPosts: () =>
        Promise.resolve([{ id: 'post-1', title: 'Title', content: 'Content', communityId: null }]),
      runToolLoop: () => Promise.reject(genericError),
    })

    expect(stats).toEqual({
      processed: 1,
      recommendations_created: 0,
      duplicates_skipped: 0,
      iterations: 0,
    })
  })
})
