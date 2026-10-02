import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { listCopyrightRepeatInfringerAccountsForNotice } from '@services/copyright-notices'
import { getCopyrightRepeatInfringerAccount } from '@services/copyright-notices/repeat-infringer-incidents'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'

describe('copyright repeat-infringer routes', () => {
  it('rejects a missing notice before listing its accounts', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .get(`/api/v1/copyright-notices/${randomUUID()}/repeat-infringer-accounts`)
      .expect(404)
  })

  it('records staff dispositions and review outcomes over HTTP', async () => {
    const [poster, moderator, admin] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
      createTestUser({ administrator: true }),
    ])
    const firstNoticeId = await confirmTestRepeatInfringerNotice(
      poster.id,
      moderator,
      'repeat route',
    )
    await confirmTestRepeatInfringerNotice(poster.id, moderator, 'repeat route')
    const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    const incidentId = accounts[0]?.incident_id
    const reviewId = accounts[0]?.open_review_id
    if (!incidentId || !reviewId) throw new Error('route fixture disappeared')

    await createRequest()
      .get(`/api/v1/copyright-notices/${firstNoticeId}/repeat-infringer-accounts`)
      .expect(401)
    const staff = createRequest()
    await staff.authenticateAs(moderator)
    const listed = await staff
      .get(`/api/v1/copyright-notices/${firstNoticeId}/repeat-infringer-accounts`)
      .expect(200)
    expect(listed.body.copyright_repeat_infringer_accounts).toEqual([
      expect.objectContaining({ incident_id: incidentId, open_review_id: reviewId }),
    ])
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .set('Content-Type', 'text/plain')
      .send('nope')
      .expect(415)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'duplicate' })
      .expect(422)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'other', rationale: 'Not a disposition.' })
      .expect(422)
    const disposition = await staff
      .post(`/api/v1/copyright-repeat-infringer-incidents/${incidentId}/dispositions`)
      .send({ disposition: 'abusive', rationale: 'The notice was filed in bad faith.' })
      .expect(200)
    expect(disposition.body).toEqual({
      copyright_repeat_infringer_disposition: { incident_id: incidentId },
    })

    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'restrict', rationale: 'Moderators cannot suspend.' })
      .expect(403)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'ban', rationale: 'Not an outcome.' })
      .expect(422)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'warning' })
      .expect(422)
    const administrator = createRequest()
    await administrator.authenticateAs(admin)
    await administrator
      .post(`/api/v1/copyright-repeat-infringer-accounts/${poster.id}/reinstatements`)
      .send({ rationale: 'No termination is in effect.' })
      .expect(409)
    await staff
      .post(`/api/v1/copyright-repeat-infringer-accounts/${poster.id}/reinstatements`)
      .send({})
      .expect(422)
    const warning = await staff
      .post(`/api/v1/copyright-repeat-infringer-reviews/${reviewId}/outcomes`)
      .send({ outcome: 'no_action', rationale: 'One incident no longer counts.' })
      .expect(200)
    expect(warning.body.copyright_repeat_infringer_review).toEqual(
      expect.objectContaining({ id: reviewId, outcome: 'no_action' }),
    )
    const after = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(after.open_review_id).toBeNull()
  })
})
