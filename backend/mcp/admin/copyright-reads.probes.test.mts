import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createParsedCopyrightEmailIntake } from '@voucha/test-helpers/copyright-email-intake-fixtures'
import { getCopyrightStaffEmailIntake } from '@services/copyright-notices'
import {
  admitCopyrightEmailRecommendationRun,
  markCopyrightEmailRecommendationRunFailed,
} from '@services/copyright-notices/email-recommendation-runs'
import { ALL_TOOLS } from '../registry/index.mts'
import type { Tool } from '@services/openai-agents/tool-types'

function readIntake(administrator: Awaited<ReturnType<typeof createTestUser>>, id: string) {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'get_copyright_email_intake')
  if (!tool) throw new Error('Missing get_copyright_email_intake tool')
  return (tool as Tool<{ id: string }>).function(administrator)({ id }) as Promise<{
    copyright_email_intake: { ai_run: unknown }
  }>
}

describe('email intake AI run on REST and MCP reads', () => {
  it('names the latest run with the same id and status on both reads', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const intake = await createParsedCopyrightEmailIntake()

    // The REST handler returns this service result; the MCP tool must project the same run.
    expect((await getCopyrightStaffEmailIntake(intake.id, administrator))?.ai_run).toBeNull()
    expect((await readIntake(administrator, intake.id)).copyright_email_intake.ai_run).toBeNull()

    const runId = (await admitCopyrightEmailRecommendationRun(intake.id))!
    const active = { id: runId, status: 'active' }
    expect((await getCopyrightStaffEmailIntake(intake.id, administrator))?.ai_run).toEqual(active)
    expect((await readIntake(administrator, intake.id)).copyright_email_intake.ai_run).toEqual(
      active,
    )

    await markCopyrightEmailRecommendationRunFailed(runId)
    const failed = { id: runId, status: 'failed' }
    expect((await getCopyrightStaffEmailIntake(intake.id, administrator))?.ai_run).toEqual(failed)
    expect((await readIntake(administrator, intake.id)).copyright_email_intake.ai_run).toEqual(
      failed,
    )
  })
})
