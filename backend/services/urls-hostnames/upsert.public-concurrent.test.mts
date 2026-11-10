import { describe, expect, it } from 'vitest'
import { beginTransaction } from '@voucha/test-helpers'
import { getUrlHostnameByAny } from './get.mts'
import { prepareUrlHostnamesForOwnedMutation, upsertUrlHostnames } from './upsert.mts'

describe('concurrent public hostname batch', () => {
  it('publishes a cold hostname created in another open transaction', async () => {
    const existing = `public-existing-${crypto.randomUUID()}.example.com`
    const cold = `public-cold-${crypto.randomUUID()}.example.com`
    const existingId = (await upsertUrlHostnames(null, [existing])).get(existing)!

    await using owner = await beginTransaction()
    const coldId = (await prepareUrlHostnamesForOwnedMutation(null, [cold], owner)).get(cold)!
    const promoting = upsertUrlHostnames(null, [existing, cold])
    await owner.commit()
    const resolved = await promoting
    expect(resolved.get(existing)).toBe(existingId)
    expect(resolved.get(cold)).toBe(coldId)
    expect((await getUrlHostnameByAny(existingId))?.publicly_introduced_at).toBeInstanceOf(Date)
    expect((await getUrlHostnameByAny(coldId))?.publicly_introduced_at).toBeInstanceOf(Date)
  })
})
