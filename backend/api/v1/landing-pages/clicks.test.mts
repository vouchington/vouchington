import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserDirect,
  createTestLandingPage,
  createTestLandingPageProfileLinkItem,
} from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '@services/jwt-session'
import { v7 } from 'uuid'

describe('clicks', () => {
  let landingPageId: string
  let landingPageItemId: string
  let testDir: string
  let originalAnalyticsBackend: string | undefined
  let originalAnalyticsLocalDir: string | undefined

  async function createSession() {
    const did = v7()
    const sid = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })
    return { sid, deviceToken, sessionToken }
  }

  function setSameOriginSessionCookies(
    request: ReturnType<typeof createRequest>,
    deviceToken: string,
    sessionToken: string,
  ): void {
    request.set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`])
    request.set('Sec-Fetch-Site', 'same-origin')
  }

  beforeAll(async () => {
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-lp-click-api-test-'))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = testDir

    const user = await createTestUserDirect()
    const { landingPageId: pageId } = await createTestLandingPage(user!.id, 'Click API Test')
    landingPageId = pageId
    const { landingPageItemId: itemId } = await createTestLandingPageProfileLinkItem(
      user!.id,
      landingPageId,
    )
    landingPageItemId = itemId
  })

  afterAll(async () => {
    if (testDir) await fs.promises.rm(testDir, { force: true, recursive: true })
    if (originalAnalyticsBackend === undefined) delete process.env.ANALYTICS_BACKEND
    else process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
    if (originalAnalyticsLocalDir === undefined) delete process.env.ANALYTICS_LOCAL_DIR
    else process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
  })

  describe('POST /api/v1/landing-pages/:landingPageId/clicks', () => {
    it('returns 200 ok', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post(`/api/v1/landing-pages/${landingPageId}/clicks`)
        .send({ landing_page_item_id: landingPageItemId })
        .expect(200)

      expect(res.body.ok).toBe(true)
    })

    it('returns 400 for missing landing_page_item_id', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      await request.post(`/api/v1/landing-pages/${landingPageId}/clicks`).send({}).expect(400)
    })

    it('returns 200 when click recording is route-rate limited', async () => {
      const request = createRequest()
      const { deviceToken, sessionToken } = await createSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      let res
      for (let i = 0; i < 22; i += 1) {
        res = await request
          .post(`/api/v1/landing-pages/${landingPageId}/clicks`)
          .send({ landing_page_item_id: landingPageItemId })
          .expect(200)
      }

      expect(res!.body.ok).toBe(true)
    })

    it('returns 200 without recording analytics when Global Privacy Control is active', async () => {
      const request = createRequest()
      const { sid, deviceToken, sessionToken } = await createSession()
      setSameOriginSessionCookies(request, deviceToken.token, sessionToken.token)

      const res = await request
        .post(`/api/v1/landing-pages/${landingPageId}/clicks`)
        .set('Sec-GPC', '1')
        .send({ landing_page_item_id: landingPageItemId })
        .expect(200)

      expect(res.body.ok).toBe(true)
      await flush()

      const rows = await query<Record<string, unknown>>(
        `SELECT * FROM web_click WHERE page_kind = 'landing_page' AND target_id = '${landingPageItemId}' AND session_id = '${sid}'`,
      )
      expect(rows).toHaveLength(0)
    })
  })
})
