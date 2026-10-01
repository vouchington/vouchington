/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- registrars live outside *.test.* because jest/no-export forbids exporting them from test files, and oxfmt rewrites it() to test() there */
import { beforeAll, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '../services/users/types.mts'

type CaseListQueryContractOptions = {
  /** The list route, for example `/api/v1/appeals`. */
  path: string
  /** The response key that holds the rows, for example `appeals`. */
  listKey: string
}

/**
 * Registers the query contract cases of a status-keyed case list (`GET /appeals`, `GET /disputes`).
 * The list reads its filters leniently (unreadable limits and unknown statuses settle to defaults),
 * so the generated query contract only rejects what the settled values still get wrong. Call from a
 * literal `describe`.
 */
export function registerCaseListQueryContractTests({
  path,
  listKey,
}: CaseListQueryContractOptions): void {
  let staff: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[staff, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('answers 401 before reading the query', async () => {
    const response = await createRequest().get(`${path}?limit=1.5`)

    expect(response.status).toBe(401)
    expect(response.text).not.toMatch(/schema|must be|invalid/i)
  })

  it.each(['limit=1.5', 'limit=2.25&status=dismissed'])(
    'answers 422 for a fractional limit (%s), which used to reach SQL and answer 500',
    async query => {
      for (const user of [staff, member]) {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`${path}?${query}`).expect(422)
      }
    },
  )

  it.each([
    'limit=500',
    'limit=abc',
    'limit=0',
    'limit=-3',
    'status=nope',
    'status=a&status=b',
    'mine=nope',
    'unknown=1',
  ])('keeps the lenient fallback for %s', async query => {
    const request = createRequest()
    await request.authenticateAs(staff)

    const response = await request.get(`${path}?${query}`).expect(200)
    expect(response.body[listKey].length).toBeLessThanOrEqual(100)
  })

  it('keeps the cursor 400 and the member scope', async () => {
    const request = createRequest()
    await request.authenticateAs(member)

    await request.get(`${path}?after=not-a-cursor`).expect(400)
    await request.get(`${path}?mine=true&limit=1`).expect(200)
  })
}
