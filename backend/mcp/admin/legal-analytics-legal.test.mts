import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { suspendTestUser } from '@voucha/test-helpers/entities/users'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { randomUUID } from 'node:crypto'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { useStaydownMatching } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { readCopyrightStaffQueueCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { recordCopyrightStaydownExactMatch } from '@services/copyright-notices/staydown-matches'
import { findSchemaViolation } from '@vouchington/mcp-server/schema'
import { ALL_TOOLS } from '../registry/index.mts'
import type { Tool } from '@services/openai-agents/tool-types'

function readTool<TArgs>(name: string): Tool<TArgs> {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === name)
  if (!tool) throw new Error(`Missing copyright read tool: ${name}`)
  return tool as Tool<TArgs>
}

describe('copyright association search REST and MCP parity', () => {
  it('rejects suspended staff on both REST and MCP association search', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    await suspendTestUser(administrator.id)
    const request = createRequest()
    await request.authenticateAs(administrator)
    await request.get('/api/v1/copyright-notices/association-targets?q=work').expect(403)
    const tool = readTool<{ q: string }>('search_copyright_notices_for_association')
    await expect(tool.function(administrator)({ q: 'work' })).rejects.toMatchObject({ status: 403 })
  })

  it('preserves association facts while wrapping claimant and work text for MCP', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const workDescription = `searched-work-${randomUUID()}`
    const claimantDisplayName = 'Claimant legal name'.padEnd(200, '!')
    const noticeId = await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      workDescription,
      undefined,
      claimantDisplayName,
    )
    const request = createRequest()
    await request.authenticateAs(administrator)
    const response = await request
      .get('/api/v1/copyright-notices/association-targets')
      .query({ q: workDescription })
      .expect(200)
    const restNotice = response.body.copyright_notices.find(
      (notice: { id: string }) => notice.id === noticeId,
    )
    expect(restNotice).toMatchObject({
      id: noticeId,
      claimant_display_name: claimantDisplayName,
      work_description: workDescription,
    })
    const tool = readTool<{ q: string; after?: string }>('search_copyright_notices_for_association')
    const result = (await tool.function(administrator)({ q: workDescription })) as {
      copyright_notices: Array<{
        id: string
        jurisdiction: string
        received_at: string
        claimant_display_name: string | null
        work_description: string
      }>
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    const mcpNotice = result.copyright_notices.find(notice => notice.id === noticeId)
    expect(mcpNotice).toMatchObject({
      id: noticeId,
      jurisdiction: restNotice.jurisdiction,
      received_at: restNotice.received_at,
      claimant_display_name: expect.stringContaining('<external-content'),
      work_description: expect.stringContaining('<external-content'),
    })
    expect(mcpNotice?.claimant_display_name).toContain(claimantDisplayName)
    expect(mcpNotice?.work_description).toContain(workDescription)
    if (!tool.meta?.outputSchema) throw new Error('Association search output schema missing')
    expect(findSchemaViolation(tool.meta.outputSchema, result)).toBeNull()
  })
})

describe('copyright username aliases at the MCP boundary', () => {
  useCopyrightIntakeEnvironment()
  useStaydownMatching()

  it('marks account and uploader usernames while preserving REST facts and MCP schemas', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const username = `copyright_${randomUUID().replaceAll('-', '')}`.slice(0, 30)
    const poster = await createTestUser({ username })
    const uploaderUsername = `uploader_${randomUUID().replaceAll('-', '')}`.slice(0, 30)
    const uploader = await createTestUser({ username: uploaderUsername })
    const { notice } = await createClearScreenedForm(1, { poster })
    const noticeId = notice.intake.copyright_notice_id
    const request = createRequest()
    await request.authenticateAs(administrator)
    await request
      .post(`/api/v1/copyright-form-intakes/${notice.intake.id}/reviews`)
      .send({ is_accepted: true, rationale: 'The signed notice is complete.' })
      .expect(200)
    const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
    const imageId = aggregate!.targets[0]!.image_id
    await recordCopyrightStaydownExactMatch({ imageId, uploadedById: uploader.id })

    const accountsResponse = await request
      .get(`/api/v1/copyright-notices/${noticeId}/repeat-infringer-accounts`)
      .expect(200)
    const restAccount = accountsResponse.body.copyright_repeat_infringer_accounts.find(
      (row: { account_user_id: string }) => row.account_user_id === poster.id,
    )
    expect(restAccount).toMatchObject({
      account_user_id: poster.id,
      account_username: username,
    })
    const accountsTool = readTool<{ id: string }>('list_repeat_infringer_accounts')
    const accountsResult = (await accountsTool.function(administrator)({
      id: noticeId,
    })) as {
      copyright_repeat_infringer_accounts: Array<{
        account_user_id: string
        account_username: string | null
      }>
    }
    const mcpAccount = accountsResult.copyright_repeat_infringer_accounts.find(
      row => row.account_user_id === poster.id,
    )
    expect(mcpAccount).toMatchObject({
      ...restAccount,
      account_username: expect.stringContaining('<external-content'),
    })
    expect(mcpAccount?.account_username).toContain(username)
    if (!accountsTool.meta?.outputSchema) throw new Error('Repeat accounts output schema missing')
    expect(findSchemaViolation(accountsTool.meta.outputSchema, accountsResult)).toBeNull()

    const after = await readCopyrightStaffQueueCursorBefore([noticeId])
    const queueResponse = await request
      .get('/api/v1/copyright-notices/review-queue')
      .query({ after, limit: 1 })
      .expect(200)
    const restCase = queueResponse.body.copyright_notices[0]
    expect(restCase).toMatchObject({ id: noticeId })
    const restMatch = restCase.staydown_matches.find(
      (row: { image_id: string }) => row.image_id === imageId,
    )
    expect(restMatch).toMatchObject({
      uploaded_by_id: uploader.id,
      uploaded_by_username: uploaderUsername,
    })
    const queueTool = readTool<{ after: string; limit: number }>('list_copyright_review_queue')
    const queueResult = (await queueTool.function(administrator)({ after, limit: 1 })) as {
      copyright_notices: Array<{
        id: string
        staydown_matches: Array<{ image_id: string; uploaded_by_username: string | null }>
      }>
    }
    expect(queueResult.copyright_notices[0]).toMatchObject({ id: noticeId })
    const mcpMatch = queueResult.copyright_notices[0]!.staydown_matches.find(
      row => row.image_id === imageId,
    )
    expect(mcpMatch).toMatchObject({
      ...restMatch,
      uploaded_by_username: expect.stringContaining('<external-content'),
    })
    expect(mcpMatch?.uploaded_by_username).toContain(uploaderUsername)
    if (!queueTool.meta?.outputSchema) throw new Error('Staff queue output schema missing')
    expect(findSchemaViolation(queueTool.meta.outputSchema, queueResult)).toBeNull()
  })
})
