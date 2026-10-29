import { describe, expect, it } from 'vitest'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import {
  readTestCopyrightStaffCase,
  withTestCopyrightStaffReaderTransaction,
} from '@voucha/test-helpers/services/copyright-notices/staff-case'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { appendCopyrightGuestFiling, issueCopyrightGuestCapability } from './index.mts'
import { listCopyrightStaffQueue } from './read-models-staff.mts'
import {
  destroyTestCopyrightNoticeKeyWithoutErasureMarker,
  markTestCopyrightNoticeErasedAndCommit,
} from '@voucha/test-helpers/copyright-email-manual-association'

describe('guest court or CCB filing staff reads', () => {
  it('shows the guest filing statement in both the staff case and queue', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const notice = { id: intake.copyright_notice_id }
    const staff = await createTestCopyrightStaff()
    const now = new Date()
    const capability = await issueCopyrightGuestCapability({
      issuedAt: new Date(),
      currentUser: staff,
      noticeId: notice.id,
      expiresAt: new Date(now.getTime() + 60_000),
    })
    const statement = 'I filed suit concerning the material identified in this notice.'
    const filing = await appendCopyrightGuestFiling({
      noticeId: notice.id,
      token: capability.token,
      now,
      kind: 'court_or_ccb_hold',
      statement,
    })
    const [key] = await readCopyrightStaffQueueCursorRows([notice.id])
    expect(key).toBeDefined()
    const [staffCase, queue] = await Promise.all([
      readTestCopyrightStaffCase(notice.id),
      listCopyrightStaffQueue(staff, {
        limit: 1,
        after: { tier: key!.tier, timestamp: key!.waiting_since_before, id: notice.id },
      }),
    ])
    const expectedHold = {
      submission_id: filing.id,
      statement: { summary: statement },
      assessment: null,
    }
    expect(staffCase?.legal_holds).toEqual([expect.objectContaining(expectedHold)])
    expect(queue.cases[0]?.id).toBe(notice.id)
    expect(queue.cases[0]?.legal_holds).toEqual([expect.objectContaining(expectedHold)])
  })

  it('rechecks queue ownership after erasure destroys the key while the reader waits', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const staff = await createTestCopyrightStaff()
    const noticeId = intake.copyright_notice_id
    const [queueKey] = await readCopyrightStaffQueueCursorRows([noticeId])
    expect(queueKey).toBeDefined()
    await withTestCopyrightStaffReaderTransaction(async (reader, isolation) => {
      expect(isolation).toBe('read committed')
      const candidateRead = Promise.withResolvers<{ rows: unknown[] }>()
      const releaseReader = Promise.withResolvers<void>()
      let paused = false
      const observed = new Proxy(reader, {
        apply(target, thisArgument, argumentsList) {
          const input = argumentsList[0]
          const statement = typeof input === 'string' ? input : input.text
          const pending = Reflect.apply(target, thisArgument, argumentsList)
          if (paused || !statement.includes('/* listPendingCopyrightStaffCases */')) return pending
          paused = true
          return Promise.resolve(pending).then(async value => {
            candidateRead.resolve(value)
            await releaseReader.promise
            return value
          })
        },
      })
      const pending = listCopyrightStaffQueue(
        staff,
        { limit: 10, noticeIds: [noticeId] },
        { query: observed },
      )
      try {
        const queueRows = await Promise.race([
          candidateRead.promise,
          pending.then(() => {
            throw new Error('Staff queue reader completed before selecting its candidate row')
          }),
        ])
        expect(queueRows.rows).not.toHaveLength(0)
        await markTestCopyrightNoticeErasedAndCommit(noticeId)
        releaseReader.resolve()
        await expect(pending).resolves.toMatchObject({
          cases: [],
          endCursor: null,
          hasNextPage: false,
        })
      } finally {
        releaseReader.resolve()
        await pending.catch(() => undefined)
      }
    })
  })

  it('fails closed when a live queue case has no authoritative owner key', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const staff = await createTestCopyrightStaff()
    const noticeId = intake.copyright_notice_id
    await destroyTestCopyrightNoticeKeyWithoutErasureMarker(noticeId)

    try {
      await expect(
        listCopyrightStaffQueue(staff, { limit: 10, noticeIds: [noticeId] }),
      ).rejects.toThrow('Copyright encryption batch has a missing owner key')
    } finally {
      await markTestCopyrightNoticeErasedAndCommit(noticeId)
    }
  })
})
