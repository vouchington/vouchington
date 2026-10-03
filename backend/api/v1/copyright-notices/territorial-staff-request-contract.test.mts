import { describe, expect, it } from 'vitest'
import { countEuTransparencyReportsBy } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { readCopyrightTerritorialContractShape } from '@voucha/test-helpers/data-stores/psql/copyright-eu-uk-contracts'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  TERRITORIAL_SURFACES,
  approveJurisdictionPolicy,
  createTerritorialActors,
  seedDeterminedTerritorialNotice,
  seedPendingTerritorialNotice,
  seedTerritorialRedress,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

// A caller the handler turns away answers with a bare status, never a schema diagnostic.
const SCHEMA_DIAGNOSTIC = /schema|must be|required|invalid/i

describe.each(TERRITORIAL_SURFACES)('$label staff request contracts', surface => {
  useCopyrightIntakeEnvironment()

  describe('acknowledgment failures', () => {
    it('keeps 401 and 403 ahead of the path check', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/not-a-uuid/acknowledgment-failures`

      const anonymous = await anonymousRequest.post(url).expect(401)
      expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).expect(403)
    })

    it('rejects a malformed id, then records the failure for a real notice', async () => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const noticeId = await seedPendingTerritorialNotice(surface.jurisdiction, actors.claimant)

      await actors.staffRequest
        .post(`${surface.base}/not-a-uuid/acknowledgment-failures`)
        .expect(422)
      const failure = await actors.staffRequest
        .post(`${surface.base}/${noticeId}/acknowledgment-failures`)
        .expect(200)
      expect(failure.body.acknowledgment).toMatchObject({ attempt_count: 1, acknowledged_at: null })
    })
  })

  describe('reasons', () => {
    it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`

      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).send({ injected: true }).expect(403)
    })

    it('rejects an unknown key before recording the reasons', async () => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const noticeId = await seedPendingTerritorialNotice(surface.jurisdiction, actors.claimant)
      const url = `${surface.base}/${noticeId}/${surface.determinationPath}`
      const body = { [surface.determinationField]: 'Staff reasons for the restriction' }

      await actors.staffRequest
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
      expect(
        (await readCopyrightTerritorialContractShape(noticeId))[surface.determinationCount],
      ).toBe(0)
      await actors.staffRequest.post(url).send(body).expect(201)
      expect(
        (await readCopyrightTerritorialContractShape(noticeId))[surface.determinationCount],
      ).toBe(1)
    })

    // The service decides existence, so a missing notice is a 404 for a valid body only.
    it('leaves the missing-notice 404 to the service behind a malformed body', async () => {
      const { staffRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`
      const body = { [surface.determinationField]: 'Staff reasons' }

      await staffRequest.post(url).send(body).expect(404)
      await staffRequest
        .post(url)
        .send({ ...body, injected: true })
        .expect(422)
    })

    it('keeps the field message and the path id check', async () => {
      const { staffRequest } = await createTerritorialActors()
      const field = surface.determinationField

      const rejected = await staffRequest
        .post(`${surface.base}/${crypto.randomUUID()}/${surface.determinationPath}`)
        .send({ [field]: 7 })
        .expect(422)
      expect(rejected.body.message).toBe(`${field} is required`)
      await staffRequest
        .post(`${surface.base}/not-a-uuid/${surface.determinationPath}`)
        .send({ [field]: 'Staff reasons' })
        .expect(422)
    })
  })

  describe('redress decisions', () => {
    const decisionBody = { staff_disposition: 'maintain', rationale: 'Staff kept the restriction' }

    it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
      const { anonymousRequest, strangerRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`

      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).send({ injected: true }).expect(403)
    })

    it('rejects an unknown key before recording the decision', async () => {
      const actors = await createTerritorialActors()
      await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
      const { noticeId, redressId } = await seedTerritorialRedress(surface.jurisdiction, actors)
      const url = `${surface.base}/${noticeId}/redress-requests/${redressId}/decisions`

      await actors.staffRequest
        .post(url)
        .send({ ...decisionBody, injected: true })
        .expect(422)
      // A recorded decision would make this retry a 409.
      await actors.staffRequest.post(url).send(decisionBody).expect(201)
      // Once recorded, the service's 409 sits behind a malformed body's 422.
      await actors.staffRequest
        .post(url)
        .send({ ...decisionBody, injected: true })
        .expect(422)
      await actors.staffRequest.post(url).send(decisionBody).expect(409)
    })

    it.each([
      [
        'a missing staff_disposition',
        { rationale: 'Staff rationale' },
        'staff_disposition is required',
      ],
      [
        'an unknown staff_disposition',
        { ...decisionBody, staff_disposition: 'ban' },
        'staff_disposition is required',
      ],
      ['a missing rationale', { staff_disposition: 'maintain' }, 'rationale is required'],
      ['a non-string rationale', { ...decisionBody, rationale: 7 }, 'rationale is required'],
      ['a blank rationale', { ...decisionBody, rationale: '  ' }, 'rationale is required'],
    ])('keeps the field message for %s', async (_label, body, message) => {
      const { staffRequest } = await createTerritorialActors()
      const url = `${surface.base}/${crypto.randomUUID()}/redress-requests/${crypto.randomUUID()}/decisions`

      const rejected = await staffRequest.post(url).send(body).expect(422)
      expect(rejected.body.message).toBe(message)
    })

    it('checks both path ids', async () => {
      const { staffRequest } = await createTerritorialActors()

      await staffRequest
        .post(`${surface.base}/not-a-uuid/redress-requests/${crypto.randomUUID()}/decisions`)
        .send(decisionBody)
        .expect(422)
      await staffRequest
        .post(`${surface.base}/${crypto.randomUUID()}/redress-requests/not-a-uuid/decisions`)
        .send(decisionBody)
        .expect(422)
    })
  })

  // The claimant owns the notice but is not staff, so the route turns the decision away first.
  it('keeps the staff 403 ahead of the schema diagnostic for the notice claimant', async () => {
    const actors = await createTerritorialActors()
    await approveJurisdictionPolicy(actors.administrator, surface.jurisdiction)
    const noticeId = await seedDeterminedTerritorialNotice(surface.jurisdiction, actors)

    await actors.claimantRequest
      .post(`${surface.base}/${noticeId}/redress-requests/${crypto.randomUUID()}/decisions`)
      .send({ staff_disposition: 'maintain', rationale: 'Not staff', injected: true })
      .expect(403)
  })
})

describe('EU transparency report request contract', () => {
  useCopyrightIntakeEnvironment()
  const url = '/api/v1/copyright-eu-reports'

  it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
    const { anonymousRequest, strangerRequest } = await createTerritorialActors()

    const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
    expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
    await strangerRequest.post(url).send({ injected: true }).expect(403)
  })

  it('rejects an unknown key before compiling a report', async () => {
    const { staff, staffRequest, administrator } = await createTerritorialActors()
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const body = {
      period_start: new Date(Date.now() - 60_000).toISOString(),
      period_end: new Date(Date.now() + 60_000).toISOString(),
    }

    await staffRequest
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    expect(await countEuTransparencyReportsBy(staff.id)).toBe(0)
    await staffRequest.post(url).send(body).expect(201)
    expect(await countEuTransparencyReportsBy(staff.id)).toBe(1)
  })

  it.each([
    ['period_start', 'period_start is required'],
    ['period_end', 'period_end is required'],
  ])('keeps the %s message for a mistyped field', async (field, message) => {
    const { staff, staffRequest } = await createTerritorialActors()
    const body = { period_start: new Date().toISOString(), period_end: new Date().toISOString() }

    const rejected = await staffRequest
      .post(url)
      .send({ ...body, [field]: 1 })
      .expect(422)
    expect(rejected.body.message).toBe(message)
    expect(await countEuTransparencyReportsBy(staff.id)).toBe(0)
  })
})

describe('jurisdiction policy request contracts', () => {
  const policies = '/api/v1/copyright-jurisdiction-policies'

  it('keeps 401 and 403 ahead of the schema diagnostic on both routes', async () => {
    const { anonymousRequest, strangerRequest, staffRequest } = await createTerritorialActors()
    const withdrawal = `${policies}/${crypto.randomUUID()}/withdrawals`

    for (const url of [policies, withdrawal]) {
      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.text).not.toMatch(SCHEMA_DIAGNOSTIC)
      await strangerRequest.post(url).send({ injected: true }).expect(403)
      // Moderators review notices but cannot approve policy.
      await staffRequest.post(url).send({ injected: true }).expect(403)
    }
  })

  it('rejects an unknown key before recording the approval', async () => {
    const { administratorRequest } = await createTerritorialActors()
    const body = {
      jurisdiction: 'uk',
      policy_version: `uk-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    }

    await administratorRequest
      .post(policies)
      .send({ ...body, injected: true })
      .expect(422)
    // A recorded version would make this retry a 409.
    await administratorRequest.post(policies).send(body).expect(201)
    // Once recorded, the service's 409 sits behind a malformed body's 422.
    await administratorRequest
      .post(policies)
      .send({ ...body, injected: true })
      .expect(422)
    await administratorRequest.post(policies).send(body).expect(409)
  })

  it.each([
    [
      'an unknown jurisdiction',
      { jurisdiction: 'us_dmca', policy_version: 'v1' },
      'jurisdiction is required',
    ],
    [
      'a non-string jurisdiction',
      { jurisdiction: 7, policy_version: 'v1' },
      'jurisdiction is required',
    ],
    ['a missing policy_version', { jurisdiction: 'uk' }, 'policy_version is required'],
    [
      'a non-string policy_version',
      { jurisdiction: 'uk', policy_version: 7 },
      'policy_version is required',
    ],
  ])('keeps the field message for %s', async (_label, body, message) => {
    const { administratorRequest } = await createTerritorialActors()

    const rejected = await administratorRequest.post(policies).send(body).expect(422)
    expect(rejected.body.message).toBe(message)
  })

  it('rejects a malformed withdrawal id, then withdraws a real approval', async () => {
    const { administrator, administratorRequest } = await createTerritorialActors()
    const approval = await approveJurisdictionPolicy(administrator, 'eu_dsa')

    await administratorRequest.post(`${policies}/not-a-uuid/withdrawals`).expect(422)
    await administratorRequest.post(`${policies}/${approval.id}/withdrawals`).expect(201)
    await administratorRequest.post(`${policies}/${approval.id}/withdrawals`).expect(409)
  })
})
