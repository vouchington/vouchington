import { describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, readAllQueueJobs } from '@voucha/test-helpers'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { makeAgentModelCaller } from '@voucha/test-helpers/agents/model-call-result'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { enqueueCopyrightEmailIntake } from '@queues/ai-agents/enqueues/copyright-email-intake'
import { ai_agents } from '@queues/ai-agents/queues'
import type { CopyrightEmailIntakeJobData } from '@queues/ai-agents/types'
import { processCopyrightEmailIntake } from '../../../workers/ai-agents/processors/process-copyright-email-intake.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('copyright email extraction queue admission and result polling', () => {
  useCopyrightIntakeEnvironment()

  it('leaves a parsed intake pending until its processor saves the recommendation', async () => {
    const intake = await createParsedCopyrightEmailIntake()
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    await enqueueCopyrightEmailIntake(intake.id)
    const path = `/api/v1/copyright-email-intakes/${intake.id}`
    expect((await staff.get(path).expect(200)).body.copyright_email_intake).toMatchObject({
      id: intake.id,
      recommendation: null,
    })
    const jobs = await readAllQueueJobs(ai_agents)
    const job = jobs.find(
      candidate =>
        candidate.name === 'copyright-email-intake' &&
        'intake_id' in candidate.data &&
        candidate.data.intake_id === intake.id,
    )
    expect(job).toBeDefined()
    try {
      const callModel = makeAgentModelCaller({
        recommendation: 'potentially_valid',
        submission_kind: 'notice',
        submission_summary: 'A claimant alleges an unauthorized photograph.',
        appeal_reason: null,
        counter_notice_name: null,
        counter_notice_address: null,
        counter_notice_telephone: null,
        consent_to_federal_jurisdiction: null,
        consent_to_service_of_process: null,
        good_faith_misidentification_under_penalty_of_perjury: null,
        counter_notice_electronic_signature: null,
        claimant_name: 'Claimant',
        claimant_contact: 'claimant@example.test',
        claimant_email: 'claimant@example.test',
        work_description: 'A photograph',
        has_good_faith_belief: true,
        has_accuracy_authority_under_penalty_of_perjury: true,
        electronic_signature: 'Claimant',
        target_urls: ['https://voucha.ai/posts/example'],
        source_evidence: [{ field: 'electronic_signature', excerpt: '/s/ Claimant' }],
        missing_information: [],
        moderator_reasoning: 'The required fields appear present.',
      })
      await processCopyrightEmailIntake(job! as Job<CopyrightEmailIntakeJobData>, callModel)
      expect((await staff.get(path).expect(200)).body.copyright_email_intake).toMatchObject({
        id: intake.id,
        recommendation: { structured_output: { recommendation: 'potentially_valid' } },
      })
      expect(callModel).toHaveBeenCalledOnce()
    } finally {
      await job?.remove()
    }
  })
})
