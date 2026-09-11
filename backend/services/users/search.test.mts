import { describe, expect, it } from 'vitest'
import {
  addVerifiedEmailForUser,
  createTestUser,
  safeUsername,
  softDeleteUser,
} from '@voucha/test-helpers'
import { enableQueryCapture, stopTestQueryCapture } from '../../test-helpers/query-capture.mts'
import { searchAdminUsers, searchUsers } from './search.mts'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('searchUsers', () => {
  it('returns matching users for a prefix query', async () => {
    const prefix = `srchpfx${randomSuffix()}`
    const user = await createTestUser({ username: `${prefix}abc` })

    const { results } = await searchUsers(prefix)

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('returns empty results for blank query', async () => {
    expect(await searchUsers('')).toEqual({ results: [], hasNextPage: false })
  })

  it('returns empty results for whitespace-only query', async () => {
    expect(await searchUsers('   ')).toEqual({ results: [], hasNextPage: false })
  })

  it('is case-insensitive', async () => {
    const prefix = `srchcase${randomSuffix()}`
    const user = await createTestUser({ username: `${prefix}xyz` })

    const { results } = await searchUsers(prefix.toUpperCase())

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('respects the limit option', async () => {
    const prefix = `srchlim${randomSuffix()}`
    await Promise.all([
      createTestUser({ username: `${prefix}a` }),
      createTestUser({ username: `${prefix}b` }),
      createTestUser({ username: `${prefix}c` }),
    ])

    const { results, hasNextPage } = await searchUsers(prefix, { limit: 2 })

    expect(results.length).toBeLessThanOrEqual(2)
    expect(hasNextPage).toBe(true)
  })

  it('clamps limit to max 25', async () => {
    const prefix = `srchmax${randomSuffix()}`
    const user = await createTestUser({ username: `${prefix}a` })

    const { results } = await searchUsers(prefix, { limit: 999 })

    // Just verify it doesn't error and returns valid results
    expect(Array.isArray(results)).toBe(true)
    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('returns prefix matches when prefix ends with z', async () => {
    const prefix = `srchmaxz${randomSuffix()}z`
    const user = await createTestUser({ username: `${prefix}a` })

    const { results } = await searchUsers(prefix)

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('returns prefix matches when prefix ends with 9', async () => {
    const prefix = `srchmax9${randomSuffix()}9`
    const user = await createTestUser({ username: `${prefix}a` })

    const { results } = await searchUsers(prefix)

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('treats LIKE wildcard characters as literal prefix characters', async () => {
    const unrelatedPrefix = `srchesc${randomSuffix()}`
    await createTestUser({ username: `${unrelatedPrefix}anything` })

    const { results } = await searchUsers('%')

    const hasUnrelated = results.some(u => u.username?.startsWith(unrelatedPrefix))
    expect(hasUnrelated).toBe(false)
  })

  it('returns empty for no matches on supplementary Unicode code points', async () => {
    await expect(searchUsers('😀')).resolves.toEqual({ results: [], hasNextPage: false })
  })

  it('returns an empty result for a non-matching prefix', async () => {
    await expect(searchUsers(String.fromCodePoint(0x10ffff))).resolves.toEqual({
      results: [],
      hasNextPage: false,
    })
  })

  it('does not return deleted users', async () => {
    // The view_users_public view filters deleted_at IS NULL;
    // verify a soft-deleted user is excluded from search results
    const prefix = `srchdel${randomSuffix()}`
    const alive = await createTestUser({ username: `${prefix}alive` })
    const deleted = await createTestUser({ username: `${prefix}gone` })
    await softDeleteUser(deleted!.id)

    const { results } = await searchUsers(prefix)

    expect(results.some(u => u.id === alive!.id)).toBe(true)
    expect(results.some(u => u.id === deleted!.id)).toBe(false)
  })

  it('resumes after the given cursor without repeating earlier results', async () => {
    const prefix = `srchafter${randomSuffix()}`
    await Promise.all([
      createTestUser({ username: `${prefix}a` }),
      createTestUser({ username: `${prefix}b` }),
      createTestUser({ username: `${prefix}c` }),
    ])

    const firstPage = await searchUsers(prefix, { limit: 1 })
    expect(firstPage.results).toHaveLength(1)
    expect(firstPage.hasNextPage).toBe(true)

    const after = firstPage.results[0]!.username!.toLowerCase()
    const secondPage = await searchUsers(prefix, { limit: 1, after })

    expect(secondPage.results).toHaveLength(1)
    expect(secondPage.results[0]!.id).not.toBe(firstPage.results[0]!.id)
  })
})

describe('searchAdminUsers', () => {
  it('returns private fields for username prefix matches', async () => {
    const prefix = `srchadmin${randomSuffix()}`
    const user = await createTestUser({ username: `${prefix}abc` })

    const { results } = await searchAdminUsers(prefix)

    const match = results.find(u => u.id === user!.id)
    expect(match?.email_address).toBe(user!.email_address)
  })

  it('matches exact user IDs', async () => {
    const user = await createTestUser({ username: safeUsername('srchadminid') })

    const { results } = await searchAdminUsers(user!.id)

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('returns username-less users for exact ID searches', async () => {
    const user = await createTestUser({ noUsername: true })

    const { results } = await searchAdminUsers(user!.id)

    const match = results.find(result => result.id === user!.id)
    expect(match).toMatchObject({
      id: user!.id,
      username: null,
      email_address: user!.email_address,
    })
  })

  it('matches exact primary email addresses case-insensitively', async () => {
    const user = await createTestUser({ username: safeUsername('srchadminemail') })

    const { results } = await searchAdminUsers(user!.email_address!.toUpperCase())

    expect(results.some(u => u.id === user!.id)).toBe(true)
  })

  it('does not match exact non-primary email addresses', async () => {
    const user = await createTestUser({ username: safeUsername('srchadminsecondary') })
    const secondaryEmail = `secondary-${randomSuffix()}@voucha.ai`
    await addVerifiedEmailForUser(user!.id, secondaryEmail)

    const { results } = await searchAdminUsers(secondaryEmail)

    expect(results.some(u => u.id === user!.id)).toBe(false)
  })

  it('does not use partial email matching', async () => {
    const user = await createTestUser({ username: safeUsername('srchadminemailpartial') })
    const [localPart] = user!.email_address!.split('@')

    const { results } = await searchAdminUsers(localPart!)

    expect(results.some(u => u.id === user!.id)).toBe(false)
  })

  it('orders a username-less row first and does not skip it when paginating', async () => {
    // A username-less row matched via exact ID sorts by COALESCE(LOWER(username), '') = '',
    // which must sort before, and not be dropped from, a subsequent `after` page.
    const withoutUsername = await createTestUser({ noUsername: true })
    const withUsername = await createTestUser({ username: `${withoutUsername!.id}-b` })
    const q = withoutUsername!.id

    const firstPage = await searchAdminUsers(q, { limit: 1 })
    expect(firstPage.results.map(u => u.id)).toEqual([withoutUsername!.id])
    expect(firstPage.hasNextPage).toBe(true)

    const secondPage = await searchAdminUsers(q, { limit: 1, after: '' })
    expect(secondPage.results.map(u => u.id)).toEqual([withUsername!.id])
  })

  it('limits matching users before loading private view fields', async () => {
    const prefix = `srchadminshape${randomSuffix()}`
    await createTestUser({ username: `${prefix}abc` })

    enableQueryCapture()
    try {
      await searchAdminUsers(prefix)
      const [query] = stopTestQueryCapture().filter(captured =>
        captured.text.includes('/* searchAdminUsers */'),
      )

      expect(query).toBeDefined()
      const queryText = query!.text
      expect(queryText).toContain('WITH matched_users AS MATERIALIZED')
      const matchedUsersCteMatch = queryText.match(
        /WITH matched_users AS MATERIALIZED \((?<cteBody>[\s\S]*?)\)\s*SELECT vup\.\*/,
      )
      const matchedUsersCteBody = matchedUsersCteMatch?.groups?.cteBody
      expect(matchedUsersCteBody).toEqual(expect.stringContaining('LIMIT $'))
      expect(matchedUsersCteBody).not.toContain('JOIN view_users_private')
    } catch (err) {
      stopTestQueryCapture()
      throw err
    }
  })
})
