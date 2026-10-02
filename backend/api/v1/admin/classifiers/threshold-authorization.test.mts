import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import {
  createThresholdManagementCase,
  readCandidateThresholdRows,
} from '@voucha/test-helpers/data-stores/psql/classifier-threshold-management'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'

const ABSENT_ID = '00000000-0000-7000-8000-00000000dead'

const MUTATIONS = [
  ['set', 'put', '/threshold', { lower_threshold_override: 0.1, upper_threshold_override: 0.9 }],
  ['rollback', 'post', '/threshold/rollback', { revision_id: ABSENT_ID }],
] as const

describe.each(MUTATIONS)('classifier threshold %s authorization', (_name, method, suffix, body) => {
  let moderator: PrivateUser
  let regularUser: PrivateUser
  const suspendedUserIds: string[] = []

  beforeAll(async () => {
    regularUser = await createTestUser()
    const user = await createTestUser()
    await addUserRole(user.id, 'moderator')
    moderator = (await getPrivateUserByAny(user.id))!
  })

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  async function attempt(user: PrivateUser | null, payload: object) {
    const { fixture, scope } = await createThresholdManagementCase()
    const request = createRequest()
    if (user) await request.authenticateAs(user)
    const path = `/api/v1/admin/classifiers/${scope.classifierId}/candidates/${scope.candidateId}`
    const response = await request[method](`${path}${suffix}`).send(payload)
    const rows = await readCandidateThresholdRows(fixture.topicCandidateId)
    return { response, rows }
  }

  it('requires a signed-in user', async () => {
    const { response, rows } = await attempt(null, body)

    expect(response.status).toBe(401)
    expect(rows).toHaveLength(1)
  })

  it.each([
    ['a regular user', () => regularUser],
    ['a site moderator, who may only read', () => moderator],
  ])('refuses %s before reading the body', async (_label, user) => {
    const { response, rows } = await attempt(user(), { not: 'a valid body' })

    expect(response.status).toBe(403)
    expect(rows).toHaveLength(1)
  })

  it('refuses a suspended administrator and changes nothing', async () => {
    const suspended = await createTestUser({ administrator: true })
    await suspendTestUser(suspended.id)
    suspendedUserIds.push(suspended.id)

    const { response, rows } = await attempt(suspended, body)

    expect(response.status).toBe(403)
    expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    expect(rows).toHaveLength(1)
  })
})
