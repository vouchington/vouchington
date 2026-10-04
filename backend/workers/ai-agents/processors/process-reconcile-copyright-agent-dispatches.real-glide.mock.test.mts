import { describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createSignedInCopyrightForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { readTestPendingCopyrightAgentDispatches } from '@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import {
  appendCopyrightGuestFiling,
  createCopyrightCounterNotice,
  issueCopyrightGuestCapability,
} from '@services/copyright-notices'
import { ai_agents } from '@queues/ai-agents/queues'
import { processReconcileCopyrightAgentDispatches } from './process-reconcile-copyright-agent-dispatches.mts'

// The real-Valkey project selects this suffix; keep the transport as the original module.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const jobId = (submissionId: string) => `copyright_submission_guidance_${submissionId}`

describe('copyright submission guidance backlog with new intake off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })

  it.each(['counter_notice', 'court_or_ccb_hold'] as const)(
    'reads a live %s gap from PostgreSQL and enqueues it through real GlideMQ',
    async kind => {
      const poster = await createTestUser()
      const { intake } = await createSignedInCopyrightForm(1, { poster })
      const noticeId = intake.copyright_notice_id
      const targetId = (await getCopyrightNoticePrivateAggregate(noticeId))?.targets[0]?.id
      if (!targetId) throw new Error('Counter-notice target missing')
      let submissionId: string
      if (kind === 'counter_notice') {
        const submitted = await createCopyrightCounterNotice(
          poster,
          noticeId,
          crypto.randomUUID(),
          {
            name: 'Poster',
            address: '1 Main Street',
            telephone: '555-0100',
            consentToFederalJurisdiction: true,
            consentToServiceOfProcess: true,
            goodFaithMisidentificationUnderPenaltyOfPerjury: true,
            electronicSignature: 'Poster',
            targetIds: [targetId],
          },
        )
        submissionId = submitted.submission.id
      } else {
        const staff = await createTestUser({ extraRoles: ['moderator'] })
        const capability = await issueCopyrightGuestCapability({
          currentUser: staff,
          noticeId,
          expiresAt: new Date(Date.now() + 60_000),
        })
        const hold = await appendCopyrightGuestFiling({
          noticeId,
          token: capability.token,
          now: new Date(),
          kind: 'court_or_ccb_hold',
          statement: 'Court case 1:26-cv-01234 was filed.',
        })
        submissionId = hold.id
      }
      expect(await readTestPendingCopyrightAgentDispatches(submissionId)).toEqual([
        { kind: 'submission-guidance', submissionId },
      ])

      try {
        await processReconcileCopyrightAgentDispatches({
          // The helper scopes the production PostgreSQL query to this test's submission.
          getPending: async () => ({
            results: await readTestPendingCopyrightAgentDispatches(submissionId),
            page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
          }),
        })
        const job = await ai_agents.getJob(jobId(submissionId))
        expect(job?.name).toBe('copyright-submission-guidance')
        expect(job?.data).toEqual({ submission_id: submissionId })
      } finally {
        const job = await ai_agents.getJob(jobId(submissionId))
        if (job) await job.remove()
      }
    },
    60_000,
  )
})
