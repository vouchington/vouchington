/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { beforeAll, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { createTestUser, makeRandomEmbedding, seedSearchEmbeddingCache } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type IdPage = {
  results: { id: string }[]
  page_info: { has_next_page: boolean; end_cursor?: string | null }
}

/** Shared post and topic similarity search cases. Call from a literal `describe`. */
export function registerSimilaritySearchTests(options: {
  similarHash: string
  semanticHash: string
  insert: (userId: string, label: string) => Promise<string>
  updateEmbedding: (id: string, inputSha256: Buffer, embedding: number[]) => Promise<void>
  searchSimilar: (user: PrivateUser, sourceId: string, after?: string) => Promise<IdPage>
  searchBare: (user: PrivateUser, sourceId: string) => Promise<IdPage>
  searchSemantic: (user: PrivateUser, query: string) => Promise<IdPage>
  onPage?: (result: IdPage, sourceId: string) => void
}): void {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  test('pages similarity results without throwing', async () => {
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update(options.similarHash).digest()
    const sourceId = await options.insert(user.id, 'source')
    await options.updateEmbedding(sourceId, inputSha256, sharedEmbedding)

    const siblingIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = await options.insert(user.id, `sibling-${i}`)
      await options.updateEmbedding(id, inputSha256, sharedEmbedding)
      siblingIds.push(id)
    }

    const found = new Set<string>()
    let after: string | undefined
    let iterations = 0

    while (iterations < 20) {
      const result = await options.searchSimilar(user, sourceId, after)
      options.onPage?.(result, sourceId)
      result.results.forEach(row => found.add(row.id))
      if (!result.page_info.has_next_page) break
      expect(result.page_info.end_cursor).toBeTruthy()
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    expect(found.has(siblingIds[0]!)).toBe(true)
    expect(found.has(siblingIds[1]!)).toBe(true)
    expect(found.has(siblingIds[2]!)).toBe(true)
  })

  test('returns empty results when the source has no embedding', async () => {
    const bareSource = await options.insert(user.id, 'bare-source')
    const result = await options.searchBare(user, bareSource)
    expect(result.results).toHaveLength(0)
    expect(result.page_info.has_next_page).toBe(false)
  })

  test('finds a matching row from a cache-seeded semantic query', async () => {
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update(options.semanticHash).digest()
    const testQuery = `${options.semanticHash}-${Date.now()}-${Math.random()}`
    await seedSearchEmbeddingCache(testQuery, sharedEmbedding)

    const id = await options.insert(user.id, 'semantic')
    await options.updateEmbedding(id, inputSha256, sharedEmbedding)

    const result = await options.searchSemantic(user, testQuery)
    expect(result.results.some(row => row.id === id)).toBe(true)
  })
}
