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

  it('searches an eligible case by work with the same paged result schema as REST', async () => {
    const administrator = await createTestUser({ extraRoles: ['administrator'] })
    const workDescription = `searched-work-${randomUUID()}`
    const noticeId = await createCopyrightNoticeForManualAssociation(
      false,
      'us_dmca',
      workDescription,
    )
    const tool = readTool<{ q: string; after?: string }>('search_copyright_notices_for_association')
    const result = (await tool.function(administrator)({ q: workDescription })) as {
      copyright_notices: Array<{ id: string }>
      page_info: { has_next_page: boolean; end_cursor: string | null }
    }
    expect(result.copyright_notices).toContainEqual(expect.objectContaining({ id: noticeId }))
    if (!tool.meta?.outputSchema) throw new Error('Association search output schema missing')
    expect(findSchemaViolation(tool.meta.outputSchema, result)).toBeNull()
  })
})
