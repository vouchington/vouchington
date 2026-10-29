import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { suspendTestUser } from '@voucha/test-helpers/entities/users'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightNoticeForManualAssociation } from '@voucha/test-helpers/copyright-email-manual-association'
import { randomUUID } from 'node:crypto'
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
