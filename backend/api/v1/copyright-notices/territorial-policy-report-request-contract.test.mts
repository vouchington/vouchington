import { describe, expect, it } from 'vitest'
import { useDsaTransparencyReports } from '@voucha/test-helpers/dsa-switches'
import { countEuTransparencyReportsInPeriod } from '@voucha/test-helpers/data-stores/psql/copyright-eu-reports'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  approveJurisdictionPolicy,
  createTerritorialActors,
} from '@voucha/test-helpers/services/copyright-notices/territorial-routes'

const SCHEMA_DIAGNOSTIC = /schema|must be|required|invalid/i

function randomizedReportPeriod(): { period_start: string; period_end: string } {
  const paddingMs = Number.parseInt(crypto.randomUUID().slice(0, 8), 16) % 60_000
  const center = Date.now()
  return {
    period_start: new Date(center - 60_000 - paddingMs).toISOString(),
    period_end: new Date(center + 60_000 + paddingMs).toISOString(),
  }
}

describe('EU transparency report request contract', () => {
  useCopyrightIntakeEnvironment()
  useDsaTransparencyReports()
  const url = '/api/v1/copyright-eu-reports'

  it('keeps 401 and 403 ahead of the schema diagnostic', async () => {
    const { anonymousRequest, strangerRequest } = await createTerritorialActors()

    const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
    expect(anonymous.body.message).not.toMatch(SCHEMA_DIAGNOSTIC)
    await strangerRequest.post(url).send({ injected: true }).expect(403)
  })

  it('rejects an unknown key before compiling a report', async () => {
    const { staffRequest } = await createTerritorialActors()
    const body = randomizedReportPeriod()
    const before = await countEuTransparencyReportsInPeriod(
      new Date(body.period_start),
      new Date(body.period_end),
    )

    await staffRequest
      .post(url)
      .send({ ...body, injected: true })
      .expect(422)
    expect(
      await countEuTransparencyReportsInPeriod(
        new Date(body.period_start),
        new Date(body.period_end),
      ),
    ).toBe(before)
    await staffRequest.post(url).send(body).expect(201)
    expect(
      await countEuTransparencyReportsInPeriod(
        new Date(body.period_start),
        new Date(body.period_end),
      ),
    ).toBe(before + 1)
  })

  it.each([
    ['period_start', 'period_start is required'],
    ['period_end', 'period_end is required'],
  ])('keeps the %s message for a mistyped field', async (field, message) => {
    const { staffRequest } = await createTerritorialActors()
    const body = randomizedReportPeriod()
    const before = await countEuTransparencyReportsInPeriod(
      new Date(body.period_start),
      new Date(body.period_end),
    )

    const rejected = await staffRequest
      .post(url)
      .send({ ...body, [field]: 1 })
      .expect(422)
    expect(rejected.body.message).toBe(message)
    expect(
      await countEuTransparencyReportsInPeriod(
        new Date(body.period_start),
        new Date(body.period_end),
      ),
    ).toBe(before)
  })
})

describe('jurisdiction policy request contracts', () => {
  const policies = '/api/v1/copyright-jurisdiction-policies'

  it('keeps 401 and 403 ahead of the schema diagnostic on both routes', async () => {
    const { anonymousRequest, strangerRequest, staffRequest } = await createTerritorialActors()
    const withdrawal = `${policies}/${crypto.randomUUID()}/withdrawals`

    for (const url of [policies, withdrawal]) {
      const anonymous = await anonymousRequest.post(url).send({ injected: true }).expect(401)
      expect(anonymous.body.message).not.toMatch(SCHEMA_DIAGNOSTIC)
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
