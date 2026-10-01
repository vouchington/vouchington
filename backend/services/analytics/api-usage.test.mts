import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { trackApiUsage, type ApiUsage } from './api-usage.mts'

const BEARER_TOKEN = 'vch_secret_bearer_token_that_must_never_be_stored'

function usage(overrides: Partial<ApiUsage>): ApiUsage {
  return {
    surface: 'mcp_user',
    credential: 'api_key',
    user_id: crypto.randomUUID(),
    api_key_id: crypto.randomUUID(),
    plan: 'free',
    scope_class: 'read',
    unit: 'request',
    units: 1,
    status_code: 200,
    quota_limit: 900,
    duration_ms: 7,
    ...overrides,
  }
}

describe('api-usage', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-api-usage-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  describe('trackApiUsage', () => {
    it('records an API key request with its validated identity dimensions', async () => {
      const request = usage({ plan: 'plus', scope_class: 'write', status_code: 404 })
      trackApiUsage(request)
      await flush()

      const rows = await query(`SELECT * FROM api_usage WHERE user_id = '${request.user_id}'`)

      expect(rows).toHaveLength(1)
      const [row] = rows
      expect(row).toMatchObject({
        surface: 'mcp_user',
        credential: 'api_key',
        user_id: request.user_id,
        api_key_id: request.api_key_id,
        plan: 'plus',
        scope_class: 'write',
        unit: 'request',
        status_code: 404,
      })
      expect(Number(row!.units)).toBe(1)
      expect(Number(row!.quota_limit)).toBe(900)
      expect(Number(row!.duration_ms)).toBe(7)
      expect(row!.oauth_client_id ?? null).toBeNull()
      expect(row!.oauth_grant_id ?? null).toBeNull()
      expect(row!.event_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/))
      expect(String(row!.event_date)).toMatch(/^\d{4}-\d{2}-\d{2}/)
    })

    it('records an OAuth request with its client and grant ids and no API key id', async () => {
      const request = usage({
        surface: 'mcp_admin',
        credential: 'oauth',
        api_key_id: undefined,
        oauth_client_id: `client-${crypto.randomUUID()}`,
        oauth_grant_id: crypto.randomUUID(),
        units: 0,
        status_code: 429,
      })
      trackApiUsage(request)
      await flush()

      const [row] = await query(`SELECT * FROM api_usage WHERE user_id = '${request.user_id}'`)

      expect(row).toMatchObject({
        surface: 'mcp_admin',
        credential: 'oauth',
        oauth_client_id: request.oauth_client_id,
        oauth_grant_id: request.oauth_grant_id,
        status_code: 429,
      })
      expect(Number(row!.units)).toBe(0)
      expect(row!.api_key_id ?? null).toBeNull()
    })

    it('stores no credential material: the row only has identity ids and counters', async () => {
      const request = usage({})
      // A caller that mistakenly forwards a secret still cannot widen the stored row.
      trackApiUsage({ ...request, authorization: `Bearer ${BEARER_TOKEN}` } as ApiUsage)
      await flush()

      const [row] = await query(`SELECT * FROM api_usage WHERE user_id = '${request.user_id}'`)

      expect(Object.keys(row!).sort()).toEqual(
        [
          'api_key_id',
          'credential',
          'duration_ms',
          'env',
          'event_date',
          'event_id',
          'event_time',
          'oauth_client_id',
          'oauth_grant_id',
          'plan',
          'quota_limit',
          'scope_class',
          'status_code',
          'surface',
          'unit',
          'units',
          'user_id',
        ].sort(),
      )
      expect(
        JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? 0 : value)),
      ).not.toContain(BEARER_TOKEN)
    })
  })
})
