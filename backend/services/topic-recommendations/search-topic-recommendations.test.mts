import { describe, expect, it } from 'vitest'
import { searchTopicRecommendations } from './index.mts'

describe('searchTopicRecommendations', () => {
  it('enriches malformed cursors with the service context', async () => {
    const options = { after: 'malformed-cursor' }

    await expect(searchTopicRecommendations(options)).rejects.toMatchObject({
      status: 400,
      extra: { function: 'searchTopicRecommendations', options },
      tags: { path: 'search-topic-recommendations' },
    })
  })
})
