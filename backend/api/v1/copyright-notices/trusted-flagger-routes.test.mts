import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { approveJurisdictionPolicy } from '@voucha/test-helpers/services/copyright-notices/territorial-routes'
import { readTestCopyrightTrustedFlaggerMatch } from '@voucha/test-helpers/copyright-trusted-flaggers'

const path = '/api/v1/copyright-trusted-flaggers'

function entryBody(userId: string) {
  return {
    name: `Flagger ${crypto.randomUUID()}`,
    user_id: userId,
    awarding_coordinator_name: 'Example Digital Services Coordinator',
    awarding_member_state: 'DE',
    awarded_on: '2026-09-01',
    area_of_expertise: 'intellectual_property',
    area_description: 'Copyright notices',
    award_reference: `https://example.test/${crypto.randomUUID()}`,
  }
}

describe('copyright trusted-flagger registry routes', () => {
  useCopyrightIntakeEnvironment()

  it('allows moderator reads and administrator writes without enabling priority', async () => {
    const [administrator, moderator, member, linked] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser(),
      createTestUser(),
    ])
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(administrator)
    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(moderator)
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await createRequest().get(path).expect(401)
    await memberRequest.get(path).expect(403)
    await memberRequest.post(path).send(entryBody(linked.id)).expect(403)
    await moderatorRequest.post(path).send(entryBody(linked.id)).expect(403)
    const created = await adminRequest.post(path).send(entryBody(linked.id)).expect(201)
    const id = created.body.copyright_trusted_flagger.id as string
    expect(created.body.copyright_trusted_flagger.status).toBe('active')
    const list = await moderatorRequest.get(`${path}?limit=1`).expect(200)
    expect(list.body.copyright_trusted_flaggers).toContainEqual(
      expect.objectContaining({ id, user_id: linked.id, status: 'active' }),
    )
    expect(list.body.page_info).toEqual(
      expect.objectContaining({ has_next_page: expect.any(Boolean) }),
    )
    await moderatorRequest.get(`${path}/${id}`).expect(200)
    await moderatorRequest
      .post(`${path}/${id}/status-changes`)
      .send({
        change_type: 'suspended',
        reason: 'Commission list update',
      })
      .expect(403)
    await adminRequest
      .post(`${path}/${id}/status-changes`)
      .send({
        change_type: 'suspended',
        reason: 'Commission list update',
      })
      .expect(201)
    expect(
      (await moderatorRequest.get(`${path}/${id}`).expect(200)).body.copyright_trusted_flagger
        .status,
    ).toBe('suspended')
    await adminRequest
      .post(`${path}/${id}/status-changes`)
      .send({
        change_type: 'reinstated',
        reason: 'Commission list update',
      })
      .expect(201)
    await adminRequest
      .post(`${path}/${id}/status-changes`)
      .send({
        change_type: 'revoked',
        reason: 'Commission list update',
      })
      .expect(201)
    await adminRequest
      .post(`${path}/${id}/status-changes`)
      .send({
        change_type: 'reinstated',
        reason: 'Final revocation',
      })
      .expect(409)
    await adminRequest
      .post(`${path}/${crypto.randomUUID()}/status-changes`)
      .send({
        change_type: 'revoked',
        reason: 'Missing entry',
      })
      .expect(404)
    const deleteResponse = await adminRequest.delete(`${path}/${id}`).expect(405)
    expect(deleteResponse.headers.allow).toBe('GET')
    const patchResponse = await adminRequest
      .patch(`${path}/${id}`)
      .send({ name: 'Changed' })
      .expect(405)
    expect(patchResponse.headers.allow).toBe('GET')
  })

  it('rejects malformed and unknown create or change bodies without writing', async () => {
    const [administrator, linked] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    const request = createRequest()
    await request.authenticateAs(administrator)
    const body = entryBody(linked.id)
    for (const invalid of [
      { ...body, name: '' },
      { ...body, user_id: 'not-a-uuid' },
      { ...body, awarding_member_state: 'GBR' },
      { ...body, awarding_member_state: 'de' },
      { ...body, awarded_on: '2026-13-40' },
      { ...body, awarded_on: '0000-01-01' },
      { ...body, area_of_expertise: 'other-kind' },
      { ...body, extra: true },
    ])
      await request.post(path).send(invalid).expect(422)
    for (const invalid of ['null', '[]', '"text"']) {
      await request.post(path).set('Content-Type', 'application/json').send(invalid).expect(422)
    }
    const created = await request.post(path).send(body).expect(201)
    const id = created.body.copyright_trusted_flagger.id as string
    const changePath = `${path}/${id}/status-changes`
    for (const invalid of [
      { change_type: 'invalid', reason: 'Wrong kind' },
      { change_type: 'suspended', reason: '' },
      { change_type: 'suspended', reason: 'Valid', extra: true },
    ])
      await request.post(changePath).send(invalid).expect(422)
    for (const invalid of ['null', '[]', '"text"']) {
      await request
        .post(changePath)
        .set('Content-Type', 'application/json')
        .send(invalid)
        .expect(422)
    }
    expect(
      (await request.get(`${path}/${id}`).expect(200)).body.copyright_trusted_flagger.status,
    ).toBe('active')
  })

  it('does not match a no-session EU notice to an account-linked entry', async () => {
    const [administrator, linked] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    await approveJurisdictionPolicy(administrator, 'eu_dsa')
    const adminRequest = createRequest()
    await adminRequest.authenticateAs(administrator)
    await adminRequest.post(path).send(entryBody(linked.id)).expect(201)
    const suffix = crypto.randomUUID()
    const filed = await createRequest()
      .post('/api/v1/copyright-eu-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        notifier_name: 'Guest notifier',
        notifier_email: `guest-${suffix}@example.test`,
        has_good_faith_statement: true,
        contact: `Contact ${suffix}`,
        content_description: `Work ${suffix}`,
        grounds: `Grounds ${suffix}`,
        hosted_use_url: `https://example.test/${suffix}`,
      })
      .expect(201)
    expect(
      await readTestCopyrightTrustedFlaggerMatch(filed.body.copyright_eu_notice.notice_id),
    ).toBeNull()
  })
})
