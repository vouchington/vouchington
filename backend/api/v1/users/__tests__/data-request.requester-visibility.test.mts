import { describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, safeUsername } from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

import {
  getDataRequestById,
  markDataRequestProcessing,
  markDataRequestReady,
} from '@services/account-data-requests'

// Admin-run exports (for example a legal-process hold) use the subject's own data-request
// route. The subject must never see them, and the admin keeps sight of what the admin asked for.
async function createSubjectAndAdmin(label: string) {
  const [subject, admin] = await Promise.all([
    createTestUser({ username: safeUsername(`dr-vis-${label}`) }),
    createTestUser({ username: safeUsername(`dr-vis-adm-${label}`), administrator: true }),
  ])
  return { subject: subject!, admin: admin! }
}

async function postAs(actor: PrivateUser, subjectId: string) {
  const request = createRequest()
  await request.authenticateAs(actor)
  return request.post(`/api/v1/users/${subjectId}/data-request`)
}

async function getAs(actor: PrivateUser, subjectId: string, suffix = '') {
  const request = createRequest()
  await request.authenticateAs(actor)
  return request.get(`/api/v1/users/${subjectId}/data-request${suffix}`)
}

async function makeReady(requestId: string) {
  expect(await markDataRequestProcessing(requestId)).toBe(true)
  expect(
    await markDataRequestReady(requestId, `${requestId}.zip`, new Date(Date.now() + 60_000)),
  ).toBe(true)
}

describe('data request requester visibility', () => {
  it('records the admin as the requester and the subject as the subject', async () => {
    const { subject, admin } = await createSubjectAndAdmin('record')

    const adminResponse = await postAs(admin, subject.id)
    expect(adminResponse.status).toBe(201)
    const adminRow = await getDataRequestById(subject.id, admin.id, adminResponse.body.id)
    expect(adminRow).toMatchObject({ user_id: subject.id, requested_by_id: admin.id })

    const selfResponse = await postAs(subject, subject.id)
    expect(selfResponse.status).toBe(201)
    const selfRow = await getDataRequestById(subject.id, subject.id, selfResponse.body.id)
    expect(selfRow).toMatchObject({ user_id: subject.id, requested_by_id: subject.id })
  })

  it('does not return an admin-requested export to the subject', async () => {
    const { subject, admin } = await createSubjectAndAdmin('hidden')
    const created = await postAs(admin, subject.id)
    expect(created.status).toBe(201)

    expect((await getAs(subject, subject.id)).status).toBe(404)

    await makeReady(created.body.id)
    const hidden = await getAs(subject, subject.id)
    expect(hidden.status).toBe(404)
    expect(JSON.stringify(hidden.body)).not.toContain('X-Amz-Signature')
  })

  it('refuses the subject a stream of an admin-requested export', async () => {
    const { subject, admin } = await createSubjectAndAdmin('stream')
    const created = await postAs(admin, subject.id)
    await makeReady(created.body.id)

    const byId = await getAs(subject, subject.id, `/stream?request_id=${created.body.id}`)
    expect(byId.status).toBe(404)
    const latest = await getAs(subject, subject.id, '/stream')
    expect(latest.status).toBe(404)
  })

  it('keeps the admin-requested export visible to the admin that requested it', async () => {
    const { subject, admin } = await createSubjectAndAdmin('admin-sees')
    const created = await postAs(admin, subject.id)
    await makeReady(created.body.id)

    const seen = await getAs(admin, subject.id)
    expect(seen.status).toBe(200)
    expect(seen.body.id).toBe(created.body.id)
    expect(seen.body.status).toBe('ready')
    expect(seen.body.download_url).toContain('X-Amz-Signature')
  })

  it('does not show one admin the export another admin requested', async () => {
    const { subject, admin } = await createSubjectAndAdmin('two-admins')
    const otherAdmin = await createTestUser({
      username: safeUsername('dr-vis-adm2-two-admins'),
      administrator: true,
    })
    await postAs(admin, subject.id)

    expect((await getAs(otherAdmin!, subject.id)).status).toBe(404)
  })

  it('still returns the subject their own request while an admin export exists', async () => {
    const { subject, admin } = await createSubjectAndAdmin('self')
    const adminExport = await postAs(admin, subject.id)
    const selfExport = await postAs(subject, subject.id)
    expect(selfExport.status).toBe(201)

    const own = await getAs(subject, subject.id)
    expect(own.status).toBe(200)
    expect(own.body.id).toBe(selfExport.body.id)

    const adminView = await getAs(admin, subject.id)
    expect(adminView.status).toBe(200)
    expect(adminView.body.id).toBe(adminExport.body.id)
  })

  it('does not reveal an active admin export through a 409 on the subject request', async () => {
    const { subject, admin } = await createSubjectAndAdmin('conflict')
    await postAs(admin, subject.id)

    const own = await postAs(subject, subject.id)
    expect(own.status).toBe(201)

    expect((await postAs(admin, subject.id)).status).toBe(409)
    expect((await postAs(subject, subject.id)).status).toBe(409)
  })
})
