import type { QueryOptions } from '@data-stores/psql/types'
import { describe, expect, it } from 'vitest'
import { lockStoryPostRelations } from './story-post-relation-locks.mts'

describe('lockStoryPostRelations', () => {
  it('locks topic relations before URL relations', async () => {
    const statements: string[] = []
    const query = (async (statement: string) => {
      statements.push(statement)
      return { rows: [], rowCount: 0 }
    }) as unknown as NonNullable<QueryOptions['query']>

    await lockStoryPostRelations(query, crypto.randomUUID())

    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain('relation__post__category__topic')
    expect(statements[1]).toContain('relation__post__related__url')
  })
})
