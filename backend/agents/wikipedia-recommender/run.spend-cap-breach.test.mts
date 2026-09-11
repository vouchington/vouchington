import { describe, expect, it } from 'vitest'
import type { BasicUser } from '@services/users/types'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'
import { recommendTopicsForContent } from './run.mts'

describe('recommendTopicsForContent spend-cap breach', () => {
  const recommenderUser = {
    __entity_type: 'user',
    id: '00000000-0000-7000-8000-000000000001',
    username: 'wikipedia-recommender',
  } as BasicUser

  it('rethrows OpenAiSpendCapBreachError instead of skipping the item and resolving', async () => {
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-03-01',
    }

    await expect(
      recommendTopicsForContent('post', ['post-1'], {
        getSystemUserByUsername: () => Promise.resolve(recommenderUser),
        getPosts: () =>
          Promise.resolve([
            { id: 'post-1', title: 'Title', content: 'Content', communityId: null },
          ]),
        runToolLoop: () => Promise.reject(new OpenAiSpendCapBreachError(breach)),
      }),
    ).rejects.toThrow(OpenAiSpendCapBreachError)
  })
})
