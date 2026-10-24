import { describe, it, expect } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { dismissAside } from './dismiss.mts'
import { restoreAside } from './restore.mts'
import { listAsidePreferences } from './list.mts'

describe('aside-preferences service', () => {
  it('dismissAside adds an aside key to dismissed set', async () => {
    const user = await createTestUser()
    await dismissAside(user.id, 'trending-topics')

    const preferences = await listAsidePreferences(user.id)
    expect(preferences.map(preference => preference.aside_key)).toContain('trending-topics')
  })

  it('dismissAside is idempotent (upsert)', async () => {
    const user = await createTestUser()
    await dismissAside(user.id, 'trending-topics')
    await dismissAside(user.id, 'trending-topics')

    const preferences = await listAsidePreferences(user.id)
    expect(preferences.map(preference => preference.aside_key)).toContain('trending-topics')
  })

  it('restoreAside removes a dismissed aside key', async () => {
    const user = await createTestUser()
    await dismissAside(user.id, 'curated-topics')
    await restoreAside(user.id, 'curated-topics')

    const preferences = await listAsidePreferences(user.id)
    expect(preferences.map(preference => preference.aside_key)).not.toContain('curated-topics')
  })

  it('restoreAside is a no-op if key was not dismissed', async () => {
    const user = await createTestUser()
    await expect(restoreAside(user.id, 'non-existent-key')).resolves.not.toThrow()
  })

  it('listAsidePreferences returns all dismissed asides ordered by dismissed_at desc', async () => {
    const user = await createTestUser()
    await dismissAside(user.id, 'trending-sources')
    await dismissAside(user.id, 'trending-communities')

    const result = await listAsidePreferences(user.id)
    const keys = result.map(r => r.aside_key)
    expect(keys).toContain('trending-sources')
    expect(keys).toContain('trending-communities')
  })

  it('listAsidePreferences returns aside_key and dismissed_at fields', async () => {
    const user = await createTestUser()
    await dismissAside(user.id, 'connect-social')

    const result = await listAsidePreferences(user.id)
    const entry = result.find(r => r.aside_key === 'connect-social')
    expect(entry).toBeDefined()
    expect(entry!.id).toBeTruthy()
    expect(entry!.dismissed_at).toBeInstanceOf(Date)
  })
})
