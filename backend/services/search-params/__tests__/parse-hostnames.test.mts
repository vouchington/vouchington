import { it, expect, describe } from 'vitest'
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

  it('parseHostnamesSearchParams defaults blocked=false for anonymous users', async () => {
    const result = await parseHostnamesSearchParams({}, null)
    expect(result.query).toBeUndefined()
    expect(result.hostname).toBeUndefined()
    expect(result.blocked).toBe(false)
    expect(result.crawlable).toBeUndefined()
    expect(result.limit).toBe(50)
  })

  it('parseHostnamesSearchParams parses query and hostname strings', async () => {
    const result = await parseHostnamesSearchParams(
      { query: 'example', hostname: 'example.com' },
      null,
    )
    expect(result.query).toBe('example')
    expect(result.hostname).toBe('example.com')
  })

  it('parseHostnamesSearchParams forces blocked=false for anonymous users ignoring query param', async () => {
    const result = await parseHostnamesSearchParams({ blocked: '1', crawlable: '0' }, null)
    expect(result.blocked).toBe(false)
    expect(result.crawlable).toBeUndefined()
  })

  it('parseHostnamesSearchParams forces blocked=false for non-admin users ignoring query param', async () => {
    const result = await parseHostnamesSearchParams({ blocked: '1', crawlable: '0' }, regularUser)
    expect(result.blocked).toBe(false)
    expect(result.crawlable).toBeUndefined()
  })

  it('parseHostnamesSearchParams parses blocked/crawlable for admin users', async () => {
    const result = await parseHostnamesSearchParams({ blocked: '1', crawlable: '0' }, adminUser)
    expect(result.blocked).toBe(true)
    expect(result.crawlable).toBe(false)
  })

  it('parseHostnamesSearchParams treats blocked=null as undefined for admin users', async () => {
    const result = await parseHostnamesSearchParams({ blocked: 'null' }, adminUser)
    expect(result.blocked).toBeUndefined()
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
