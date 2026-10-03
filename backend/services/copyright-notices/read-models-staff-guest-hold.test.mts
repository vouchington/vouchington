import { describe, expect, it } from 'vitest'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { createTestCopyrightStaff } from '@voucha/test-helpers/services/copyright-notices/guest-capability'
import { readTestCopyrightStaffCase } from '@voucha/test-helpers/services/copyright-notices/staff-case'
import { readCopyrightStaffQueueCursorRows } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { appendCopyrightGuestFiling, issueCopyrightGuestCapability } from './index.mts'
import { listCopyrightStaffQueue } from './read-models-staff.mts'

describe('guest court or CCB filing staff reads', () => {
  it('shows the guest filing statement in both the staff case and queue', async () => {
    const { intake } = await createSignedInCopyrightForm()
    const notice = { id: intake.copyright_notice_id }
    const staff = await createTestCopyrightStaff()
    const now = new Date()
    const capability = await issueCopyrightGuestCapability({
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
        after: { tier: key!.urgency, timestamp: key!.waiting_since_before, id: notice.id },
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
})
