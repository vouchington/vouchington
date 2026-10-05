import { randomUUID } from 'node:crypto'
import { it, expect, describe } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { parseHostnamesSearchParams } from '../parse-hostnames.mts'

describe('parse-hostnames', () => {
  const adminUser = {
    id: 'admin-id',
    roles: ['administrator'],
  } as unknown as Parameters<typeof parseHostnamesSearchParams>[1]

  const regularUser = {
    id: 'user-id',
    roles: [],
  } as unknown as Parameters<typeof parseHostnamesSearchParams>[1]

  it('parseHostnamesSearchParams defaults is_blocked=false for anonymous users', async () => {
    const result = await parseHostnamesSearchParams({}, null)
    expect(result.query).toBeUndefined()
    expect(result.hostname).toBeUndefined()
    expect(result.is_blocked).toBe(false)
    expect(result.is_crawlable).toBeUndefined()
    expect(result.limit).toBe(50)
    expect(result).not.toHaveProperty('topic_ids')
  })

  it('includes resolved plural topic ids', async () => {
    const user = await createTestUser({ administrator: true })
    expect(user).toBeTruthy()
    const suffix = randomUUID()
    const slug = `parse-hostnames-${suffix}`
    const topicId = await insertTestTopic({
      name: `Parse Hostnames ${suffix}`,
      slug,
      createdById: user!.id,
    })

    const result = await parseHostnamesSearchParams({ topics: [slug] }, null)

    expect(result.shouldReturnEmpty).toBe(false)
    expect(result.topic_ids).toEqual([topicId])
  })

  it('omits unresolved plural topic ids', async () => {
    const slug = `missing-parse-hostnames-${randomUUID()}`

    const result = await parseHostnamesSearchParams({ topics: [slug] }, null)

    expect(result.shouldReturnEmpty).toBe(true)
    expect(result).not.toHaveProperty('topic_ids')
  })

  it('parseHostnamesSearchParams parses query and hostname strings', async () => {
    const result = await parseHostnamesSearchParams(
      { query: 'example', hostname: 'example.com' },
      null,
    )
    expect(result.query).toBe('example')
    expect(result.hostname).toBe('example.com')
  })

  it('parseHostnamesSearchParams forces is_blocked=false for anonymous users ignoring query param', async () => {
    const result = await parseHostnamesSearchParams({ is_blocked: '1', is_crawlable: '0' }, null)
    expect(result.is_blocked).toBe(false)
    expect(result.is_crawlable).toBeUndefined()
  })

  it('parseHostnamesSearchParams forces is_blocked=false for non-admin users ignoring query param', async () => {
    const result = await parseHostnamesSearchParams(
      { is_blocked: '1', is_crawlable: '0' },
      regularUser,
    )
    expect(result.is_blocked).toBe(false)
    expect(result.is_crawlable).toBeUndefined()
  })

  it('parseHostnamesSearchParams parses is_blocked/is_crawlable for admin users', async () => {
    const result = await parseHostnamesSearchParams(
      { is_blocked: '1', is_crawlable: '0' },
      adminUser,
    )
    expect(result.is_blocked).toBe(true)
    expect(result.is_crawlable).toBe(false)
  })

  it('parseHostnamesSearchParams treats is_blocked=null as undefined for admin users', async () => {
    const result = await parseHostnamesSearchParams({ is_blocked: 'null' }, adminUser)
    expect(result.is_blocked).toBeUndefined()
  })

  it('parseHostnamesSearchParams parses limit', async () => {
    const result = await parseHostnamesSearchParams({ limit: '75' }, null)
    expect(result.limit).toBe(75)
  })

  it('parseHostnamesSearchParams applies bounded pagination defaults', async () => {
    await expect(parseHostnamesSearchParams({}, null)).resolves.toMatchObject({ limit: 50 })
    await expect(parseHostnamesSearchParams({ limit: '999' }, null)).resolves.toMatchObject({
      limit: 100,
    })
  })

  it('parseHostnamesSearchParams rejects invalid limits', async () => {
    await expect(parseHostnamesSearchParams({ limit: '0' }, null)).rejects.toMatchObject({
      status: 400,
    })
    await expect(parseHostnamesSearchParams({ limit: '1.5' }, null)).rejects.toMatchObject({
      status: 400,
    })
  })
})
