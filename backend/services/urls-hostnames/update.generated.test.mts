import { it, expect, describe } from 'vitest'
import { updateUrlHostname } from './update.mts'
import { upsertUrlHostnames } from './upsert.mts'
import { getUrlHostnameById } from './get.mts'
import { updateUrlHostnameBlocked } from '@voucha/test-helpers'

describe('update.generated', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('updateUrlHostnameBlocked updates blocked status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-block-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    await updateUrlHostnameBlocked(hostnameId, true)

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.blocked).toBe(true)
  })

  it('updateUrlHostname updates crawlable status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-crawl-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { crawlable: true })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.crawlable).toBe(true)
  })

  it('updateUrlHostname updates link_rel_follow status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-follow-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { link_rel_follow: false })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.link_rel_follow).toBe(false)
  })

  it('updateUrlHostname updates Web Risk skip status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-web-risk-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { skip_web_risk: true })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.skip_web_risk).toBe(true)
  })

  it('updateUrlHostname updates multiple fields', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-multi-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    await updateUrlHostnameBlocked(hostnameId, true)
    const updated = await updateUrlHostname(hostnameId, {
      crawlable: false,
      link_rel_follow: true,
    })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.blocked).toBe(true)
    expect(retrieved!.crawlable).toBe(false)
    expect(retrieved!.link_rel_follow).toBe(true)
  })

  it('updateUrlHostname returns null when no changes provided', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-nochange-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, {})
    expect(updated).toBeNull()
  })
})
