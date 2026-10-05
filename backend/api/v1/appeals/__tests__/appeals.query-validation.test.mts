import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationAppeal } from '@services/moderation-appeals/create'
import { parseCreateModerationAppealInput } from '@services/moderation-appeals/parse'
import { registerCaseListQueryContractTests } from '../../../../test-helpers/case-list-query-contract-tests.mts'

describe('GET /api/v1/appeals query contract', () => {
  registerCaseListQueryContractTests({ path: '/api/v1/appeals', listKey: 'appeals' })
})

// Plan #298: `consistency` is validated exactly as the client sent it, for every viewer and before
// the staff branch. Only moderation staff get the primary read; everyone else ignores a valid value.
describe('GET /api/v1/appeals/:id query contract', () => {
  const invalidValues = [
    ['an unknown value', 'consistency=replica'],
    ['a wrong-case value', 'consistency=PRIMARY'],
    ['an empty value', 'consistency='],
    ['a repeated value', 'consistency=primary&consistency=primary'],
  ] as const

  let staff: PrivateUser
  let appellant: PrivateUser
  let otherUser: PrivateUser
  let appealId: string

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    appellant = await createTestUser()
    otherUser = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `consistency-private-${crypto.randomUUID()}`,
      publicMessage: `consistency-public-${crypto.randomUUID()}`,
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'Consistency query contract appeal.',
    })
    const { appeal } = await createModerationAppeal(appellant, WEB_PROVENANCE, input)
    appealId = appeal.id
  })

  const detailPath = (query: string) => `/api/v1/appeals/${appealId}${query}`
  const signedIn = async (viewer: PrivateUser) => {
    const request = createRequest()
    await request.authenticateAs(viewer)
    return request
  }

  describe.each([
    ['a non-staff appellant', () => appellant],
    ['a non-staff viewer who does not own the appeal', () => otherUser],
    ['staff', () => staff],
  ])('for %s', (_label, viewer) => {
    it.each(invalidValues)('answers 422 for consistency as %s', async (_valueLabel, query) => {
      const request = await signedIn(viewer())
      const response = await request.get(detailPath(`?${query}`)).expect(422)
      expect(response.text).toContain('Invalid request query')
    })
  })

  it('serves a non-staff appellant the redacted appeal and ignores consistency=primary', async () => {
    for (const query of ['', '?consistency=primary']) {
      const response = await (await signedIn(appellant)).get(detailPath(query)).expect(200)
      expect(response.body.appeal.id).toBe(appealId)
      expect(JSON.stringify(response.body)).not.toContain('"staff_context"')
    }
  })

  it('keeps the 403 for a non-owner viewer who sends a valid or omitted consistency', async () => {
    for (const query of ['', '?consistency=primary']) {
      await (await signedIn(otherUser)).get(detailPath(query)).expect(403)
    }
  })

  it('serves staff the full appeal with or without consistency=primary', async () => {
    for (const query of ['', '?consistency=primary']) {
      const response = await (await signedIn(staff)).get(detailPath(query)).expect(200)
      expect(response.body.appeal.id).toBe(appealId)
      expect(response.body.appeal.staff_context).toBeDefined()
    }
  })
})
