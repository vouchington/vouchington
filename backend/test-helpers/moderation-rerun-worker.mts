import { createRequest } from './api/server.mts'
import { createAIAgentReportFixture } from './ai-agent-worker-fixtures.mts'
import { createTestUser, insertTestUserWarning, WEB_PROVENANCE } from './index.mts'
import { createModerationAppeal } from '../services/moderation-appeals/create.mts'
import { parseCreateModerationAppealInput } from '../services/moderation-appeals/parse.mts'

/** Admit through the real API before starting the production queue worker. */
export async function admitModerationRerunForTest(kind: 'report' | 'appeal') {
  const staff = await createTestUser({ administrator: true })
  const request = createRequest()
  await request.authenticateAs(staff)
  let providerKey: string
  let path: string
  if (kind === 'report') {
    const fixture = await createAIAgentReportFixture()
    providerKey = fixture.author.id
    path = `/api/v1/reports/${fixture.data.triggering_report_id}/judgements`
  } else {
    const appellant = await createTestUser()
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: `Worker outcome ${crypto.randomUUID()}`,
    })
    const { appeal } = await createModerationAppeal(
      appellant,
      WEB_PROVENANCE,
      parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: `Worker outcome ${crypto.randomUUID()}`,
      }),
    )
    providerKey = appellant.id
    path = `/api/v1/appeals/${appeal.id}/resolution-drafts`
  }
  const admitted = await request.post(path).send({}).expect(202)
  const runId = admitted.body.run_id as string
  return {
    request,
    providerKey,
    path,
    runId,
    resultPath: `${path}/${runId}`,
    jobId: kind === 'report' ? `report_judgement_${runId}` : runId,
  }
}
