import { it, expect, describe } from 'vitest'
import { updateUrlHostname } from './update.mts'
import { upsertUrlHostnames } from './upsert.mts'
import { getUrlHostnameById } from './get.mts'
import { updateUrlHostnameBlocked } from '@voucha/test-helpers'

describe('update.generated', () => {
  const suffix = Math.random().toString(36).slice(2, 10)

  it('updateUrlHostnameBlocked updates is_blocked status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-block-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    await updateUrlHostnameBlocked(hostnameId, true)

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.is_blocked).toBe(true)
  })

  it('updateUrlHostname updates is_crawlable status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-crawl-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { is_crawlable: true })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.is_crawlable).toBe(true)
  })

  it('updateUrlHostname updates should_follow_link_rel status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-follow-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { should_follow_link_rel: false })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.should_follow_link_rel).toBe(false)
  })

  it('updateUrlHostname updates Web Risk skip status', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-web-risk-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, { should_skip_web_risk: true })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.should_skip_web_risk).toBe(true)
  })

  it('updateUrlHostname updates multiple fields', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-multi-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    await updateUrlHostnameBlocked(hostnameId, true)
    const updated = await updateUrlHostname(hostnameId, {
      is_crawlable: false,
      should_follow_link_rel: true,
    })
    expect(updated).toBeDefined()

    const retrieved = await getUrlHostnameById(hostnameId)
    expect(retrieved!.is_blocked).toBe(true)
    expect(retrieved!.is_crawlable).toBe(false)
    expect(retrieved!.should_follow_link_rel).toBe(true)
  })

  it('updateUrlHostname returns null when no changes provided', async () => {
    const hostnamesMap = await upsertUrlHostnames(null, [`update-nochange-${suffix}.com`])
    const hostnameId = [...hostnamesMap.values()][0]

    const updated = await updateUrlHostname(hostnameId, {})
    expect(updated).toBeNull()
  })
})
