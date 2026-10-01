import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import { createDataRequest } from './create.mts'
import { createDataRequestOrConflict } from './create-or-conflict.mts'
import { getDataRequestById, getLatestDataRequest, wasDataRequestMadeBySubject } from './get.mts'

async function createSubjectAndAdmin(label: string) {
  const [subject, admin] = await Promise.all([
    createTestUser({ username: safeUsername(`dr-req-${label}`) }),
    createTestUser({ username: safeUsername(`dr-req-adm-${label}`), administrator: true }),
  ])
  return { subject: subject!, admin: admin! }
}

describe('data requests are scoped to the requester', () => {
  it('records the requester separately from the subject', async () => {
    const { subject, admin } = await createSubjectAndAdmin('record')

    const adminRequest = await createDataRequest(subject.id, admin.id)

    expect(adminRequest).toMatchObject({ user_id: subject.id, requested_by_id: admin.id })
    expect(await wasDataRequestMadeBySubject(adminRequest.id)).toBe(false)
  })

  it('recognises a request the subject made themselves', async () => {
    const { subject } = await createSubjectAndAdmin('self')

    const own = await createDataRequest(subject.id, subject.id)

    expect(own.requested_by_id).toBe(subject.id)
    expect(await wasDataRequestMadeBySubject(own.id)).toBe(true)
  })

  it('treats an unknown request as not made by the subject', async () => {
    expect(await wasDataRequestMadeBySubject(randomUUID())).toBe(false)
  })

  it('reads only the requests the caller made', async () => {
    const { subject, admin } = await createSubjectAndAdmin('reads')
    const adminRequest = await createDataRequest(subject.id, admin.id)

    expect(await getLatestDataRequest(subject.id, subject.id)).toBeNull()
    expect(await getDataRequestById(subject.id, subject.id, adminRequest.id)).toBeNull()
    expect((await getLatestDataRequest(subject.id, admin.id))?.id).toBe(adminRequest.id)
    expect((await getDataRequestById(subject.id, admin.id, adminRequest.id))?.id).toBe(
      adminRequest.id,
    )

    const own = await createDataRequest(subject.id, subject.id)
    expect((await getLatestDataRequest(subject.id, subject.id))?.id).toBe(own.id)
    expect((await getLatestDataRequest(subject.id, admin.id))?.id).toBe(adminRequest.id)
  })

  it('does not report an active admin export as a conflict for the subject', async () => {
    const { subject, admin } = await createSubjectAndAdmin('conflict')
    const adminRequest = await createDataRequest(subject.id, admin.id)

    const own = await createDataRequestOrConflict(subject.id, subject.id)
    expect(own).toMatchObject({ type: 'created' })

    const repeatedAdmin = await createDataRequestOrConflict(subject.id, admin.id)
    expect(repeatedAdmin).toMatchObject({ type: 'conflict', existing: { id: adminRequest.id } })
    const repeatedOwn = await createDataRequestOrConflict(subject.id, subject.id)
    expect(repeatedOwn).toMatchObject({ type: 'conflict' })
  })

  it('refuses a requester that does not exist', async () => {
    const { subject } = await createSubjectAndAdmin('missing')

    await expect(createDataRequest(subject.id, randomUUID())).rejects.toMatchObject({
      code: '23503',
    })
  })
})
