/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { beforeAll, expect, test } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from './api/server.mts'
import type { PrivateUser } from '../services/users/types.mts'

export type StaffContractMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** Label, method, URL and an optional JSON body for one malformed request. */
export type StaffContractCase = [
  label: string,
  method: StaffContractMethod,
  url: string,
  body?: unknown,
]

export type StaffContractOptions = {
  /** Options for the permitted caller; defaults to an administrator. */
  staff?: Parameters<typeof createTestUser>[0]
  /** Status a permitted caller sees for every case; defaults to 422. */
  status?: number
}

const SCHEMA_DIAGNOSTIC = /schema|must be|invalid|additional propert/i

/**
 * Registers the request contract ordering cases for staff routes: anonymous callers get 401 and a
 * caller without the role gets 403, both with no schema diagnostic, and only a permitted caller
 * sees the bounded 4xx. Call from a literal `describe`.
 */
export function registerStaffRequestContractTests(
  cases: readonly StaffContractCase[],
  { staff: staffOptions = { administrator: true }, status = 422 }: StaffContractOptions = {},
): void {
  let staff: PrivateUser
  let outsider: PrivateUser

  beforeAll(async () => {
    ;[staff, outsider] = (await Promise.all([
      createTestUser(staffOptions),
      createTestUser(),
    ])) as PrivateUser[]
  })

  const send = (
    request: ReturnType<typeof createRequest>,
    method: StaffContractMethod,
    url: string,
    body: unknown,
  ) => (body === undefined ? request[method](url) : request[method](url).send(body as object))

  test.each(cases)(
    '%s: 401 without a schema diagnostic for anonymous',
    async (_l, method, url, body) => {
      const response = await send(createRequest(), method, url, body)

      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(SCHEMA_DIAGNOSTIC)
    },
  )

  test.each(cases)(
    '%s: 403 without a schema diagnostic for a caller without the role',
    async (_l, method, url, body) => {
      const request = createRequest()
      await request.authenticateAs(outsider)
      const response = await send(request, method, url, body)

      expect(response.status).toBe(403)
      expect(response.text).not.toMatch(SCHEMA_DIAGNOSTIC)
    },
  )

  test.each(cases)(`%s: ${status} for a permitted caller`, async (_l, method, url, body) => {
    const request = createRequest()
    await request.authenticateAs(staff)

    expect((await send(request, method, url, body)).status).toBe(status)
  })
}
