import { describe, expect, it } from 'vitest'
import {
  beginClientIdMetadataRefresh,
  getClientIdMetadataExpiry,
} from './client-id-metadata-cache.mts'
import { parseClientIdMetadataUrl } from './client-id-metadata-url.mts'
import type { QueryExecutor } from '@data-stores/psql'

describe('Client ID Metadata Document cache', () => {
  it('keeps the exact URL spelling used as the client identifier', () => {
    expect(parseClientIdMetadataUrl('HTTPS://CLIENT.example:443/metadata.json?version=1')).toBe(
      'HTTPS://CLIENT.example:443/metadata.json?version=1',
    )
  })

  it('honors Expires when Cache-Control does not provide a freshness lifetime', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const headers = new Headers({
      date: now.toUTCString(),
      expires: new Date(now.getTime() + 120_000).toUTCString(),
    })
    expect(getClientIdMetadataExpiry(headers, now)).toEqual(new Date(now.getTime() + 120_000))
  })

  it('treats a past Expires value as immediately stale', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const headers = new Headers({
      date: now.toUTCString(),
      expires: new Date(now.getTime() - 1_000).toUTCString(),
    })
    expect(getClientIdMetadataExpiry(headers, now)).toEqual(now)
  })

  it('treats an invalid Expires value as immediately stale', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    expect(getClientIdMetadataExpiry(new Headers({ expires: 'not-a-date' }), now)).toEqual(now)
  })

  it('lets Cache-Control max-age take precedence over Expires', () => {
    const now = new Date('2026-09-27T12:00:00.000Z')
    const headers = new Headers({
      'cache-control': 'max-age=60',
      date: now.toUTCString(),
      expires: new Date(now.getTime() + 3_600_000).toUTCString(),
    })
    expect(getClientIdMetadataExpiry(headers, now)).toEqual(new Date(now.getTime() + 60_000))
  })

  it('fails closed when the database returns no refresh generation', async () => {
    const query: QueryExecutor = async () => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: 0,
      rows: [],
    })
    await expect(beginClientIdMetadataRefresh(query)).rejects.toMatchObject({
      code: 'server_error',
    })
  })
})
