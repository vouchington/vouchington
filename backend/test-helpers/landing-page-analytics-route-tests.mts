/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { afterAll, beforeAll, expect, test } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { flush } from '@data-stores/analytics/backend-local'
import { query } from '@data-stores/analytics/query'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUserDirect, createTestLandingPage } from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from '../services/jwt-session/index.mts'
import { v7 } from 'uuid'

type AnalyticsRequest = ReturnType<typeof createRequest>

/** Shared landing-page click and visit cases. Call inside the route `describe`. */
export function registerLandingPageAnalyticsTests(options: {
  route: 'clicks' | 'visits'
  pageName: string
  tempPrefix: string
  preparePage: (userId: string, landingPageId: string) => Promise<string | undefined>
  body: (itemId: string | undefined) => Record<string, unknown>
  gpcBody?: (itemId: string | undefined) => Record<string, unknown>
  privacyTable: 'web_click' | 'web_page_view'
  privacyColumn: 'target_id' | 'page_id'
  privacyId: 'item' | 'page'
  rateLimitAttempts: number
}): {
  landingPageId: () => string
  itemId: () => string
  openSession: () => Promise<{
    sid: string
    deviceToken: string
    sessionToken: string
  }>
  authenticate: (request: AnalyticsRequest, deviceToken: string, sessionToken: string) => void
} {
  let landingPageId = ''
  let itemId: string | undefined
  let testDir = ''
  let originalAnalyticsBackend: string | undefined
  let originalAnalyticsLocalDir: string | undefined

  async function openSession() {
    const did = v7()
    const sid = v7()
    const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({ did, sid })
    return { sid, deviceToken: deviceToken.token, sessionToken: sessionToken.token }
  }

  function authenticate(request: AnalyticsRequest, deviceToken: string, sessionToken: string) {
    request.set('Cookie', [`dt=${deviceToken}`, `st=${sessionToken}`])
    request.set('Sec-Fetch-Site', 'same-origin')
  }

  beforeAll(async () => {
    originalAnalyticsBackend = process.env.ANALYTICS_BACKEND
    originalAnalyticsLocalDir = process.env.ANALYTICS_LOCAL_DIR
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), options.tempPrefix))
    process.env.ANALYTICS_BACKEND = 'local'
    process.env.ANALYTICS_LOCAL_DIR = testDir

    const user = await createTestUserDirect()
    const page = await createTestLandingPage(user!.id, options.pageName)
    landingPageId = page.landingPageId
    itemId = await options.preparePage(user!.id, landingPageId)
  })

  afterAll(async () => {
    if (testDir) await fs.promises.rm(testDir, { force: true, recursive: true })
    if (originalAnalyticsBackend === undefined) {
      // oxlint-disable-next-line no-mistakes/no-delete-property -- drop the test override when the process had no prior value
      delete process.env.ANALYTICS_BACKEND
    } else process.env.ANALYTICS_BACKEND = originalAnalyticsBackend
    if (originalAnalyticsLocalDir === undefined) {
      // oxlint-disable-next-line no-mistakes/no-delete-property -- drop the test override when the process had no prior value
      delete process.env.ANALYTICS_LOCAL_DIR
    } else process.env.ANALYTICS_LOCAL_DIR = originalAnalyticsLocalDir
  })

  const routePath = () => `/api/v1/landing-pages/${landingPageId}/${options.route}`

  test('returns 200 ok', async () => {
    const request = createRequest()
    const session = await openSession()
    authenticate(request, session.deviceToken, session.sessionToken)

    const res = await request.post(routePath()).send(options.body(itemId)).expect(200)
    expect(res.body.ok).toBe(true)
  })

  test('returns 200 when recording is route-rate limited', async () => {
    const request = createRequest()
    const session = await openSession()
    authenticate(request, session.deviceToken, session.sessionToken)

    let res
    for (let i = 0; i < options.rateLimitAttempts; i += 1) {
      res = await request.post(routePath()).send(options.body(itemId)).expect(200)
    }

    expect(res!.body.ok).toBe(true)
  })

  test('returns 200 without recording analytics when Global Privacy Control is active', async () => {
    const request = createRequest()
    const session = await openSession()
    authenticate(request, session.deviceToken, session.sessionToken)

    const res = await request
      .post(routePath())
      .set('Sec-GPC', '1')
      .send((options.gpcBody ?? options.body)(itemId))
      .expect(200)

    expect(res.body.ok).toBe(true)
    await flush()

    const recordedId = options.privacyId === 'item' ? itemId : landingPageId
    const rows = await query(
      `SELECT * FROM ${options.privacyTable} WHERE page_kind = 'landing_page' AND ${options.privacyColumn} = '${recordedId}' AND session_id = '${session.sid}'`,
    )
    expect(rows).toHaveLength(0)
  })

  return {
    landingPageId: () => landingPageId,
    itemId: () => itemId ?? '',
    openSession,
    authenticate,
  }
}
