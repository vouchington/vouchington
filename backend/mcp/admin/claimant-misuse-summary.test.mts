import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import { createTestUser } from '@voucha/test-helpers'
import { suspendTestUser } from '@voucha/test-helpers/entities/users'
import { createRequest } from '@voucha/test-helpers/api/server'
import { ALL_TOOLS } from '../registry/index.mts'
import type { Tool } from '@services/openai-agents/tool-types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { copyrightConfig } from '@services/copyright-notices/config'
import { reviewCopyrightFormIntake } from '@services/copyright-notices'

const tool = ALL_TOOLS.find(
  candidate => candidate.schema.name === 'get_copyright_claimant_misuse_summary',
)
if (!tool) throw new Error('Missing claimant misuse summary legal tool')

describe('copyright claimant misuse summary legal tool', () => {
  it('matches the staff REST window and its declared output schema', async () => {
    const administrator = await createTestUser({ administrator: true })
    const claimant = await createTestUser()
    const oldest = await createClearScreenedForm(1, { claimant })
    await reviewCopyrightFormIntake({
      intakeId: oldest.notice.intake.id,
      currentUser: administrator,
      is_accepted: false,
      rationale: 'The notice does not identify the claimed work.',
    })
    await createClearScreenedForm(1, { claimant })
    onTestFinished(
      overrideDynamicConfigFieldsForTest(copyrightConfig, { claimantMisuseWindowSize: 1 }),
    )
    const claimantUserId = claimant.id
    const request = createRequest()
    await request.authenticateAs(administrator)

    const response = await request
      .get(`/api/v1/copyright-notices/claimants/${claimantUserId}/misuse-summary`)
      .expect(200)
    const result = (await (tool as Tool<{ claimant_user_id: string }>).function(administrator)({
      claimant_user_id: claimantUserId,
    })) as Record<string, unknown>

    expect(result).toEqual(response.body)
    expect(response.body.claimant_misuse).toMatchObject({
      notice_count: 1,
      notice_rejected: 0,
      page_info: { has_next_page: true },
    })
    expect(tool.meta?.outputSchema).toBeDefined()
    expect(findSchemaViolation(tool.meta!.outputSchema!, result)).toBeNull()
    const after = response.body.claimant_misuse.page_info.end_cursor as string
    const olderResponse = await request
      .get(`/api/v1/copyright-notices/claimants/${claimantUserId}/misuse-summary`)
      .query({ after })
      .expect(200)
    const olderResult = await (tool as Tool<{ claimant_user_id: string; after?: string }>).function(
      administrator,
    )({
      claimant_user_id: claimantUserId,
      after,
    })
    expect(olderResult).toEqual(olderResponse.body)
    expect(olderResponse.body.claimant_misuse).toMatchObject({
      notice_count: 1,
      notice_rejected: 1,
      page_info: { has_next_page: false },
    })
    expect(findSchemaViolation(tool.meta!.outputSchema!, olderResult)).toBeNull()
  })

  it('rejects a suspended administrator', async () => {
    const administrator = await createTestUser({ administrator: true })
    await suspendTestUser(administrator.id)
    await expect(
      (tool as Tool<{ claimant_user_id: string }>).function(administrator)({
        claimant_user_id: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
