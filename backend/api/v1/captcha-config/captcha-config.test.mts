import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { turnstileConfig } from '@services/captcha'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'

describe('GET /api/v1/captcha-config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(turnstileConfig, Object.keys(turnstileConfig.fieldTypes))
  })

  it('returns always_approve false without authentication', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/captcha-config').expect(200)

    expect(response.body).toEqual({ always_approve: false })
    expect(response.headers['cache-control']).toBe('private, no-store')
  })

  it('returns always_approve true only on staging when the knob is on', async () => {
    vi.stubEnv('ENVIRONMENT', 'staging')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })

    const request = createRequest()
    const response = await request.get('/api/v1/captcha-config').expect(200)

    expect(response.body).toEqual({ always_approve: true })
  })

  it('returns always_approve false on production even when the knob is on', async () => {
    vi.stubEnv('ENVIRONMENT', 'production')
    overrideDynamicConfigFieldsForTest(turnstileConfig, { always_approve: true })

    const request = createRequest()
    const response = await request.get('/api/v1/captcha-config').expect(200)

    expect(response.body).toEqual({ always_approve: false })
  })
})
