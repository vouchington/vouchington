import { describe, expect, it } from 'vitest'

import {
  anonymousMcpSourceCounts,
  isUnregisteredMcpToolFile,
  mcpToolFilesFromEntries,
} from './mcp-tool-file-registration.mts'

describe('MCP tool file registration', () => {
  it('keeps tool definition names and drops helpers, tests, and other files', () => {
    expect(
      mcpToolFilesFromEntries([
        'discover-topics.mts',
        'private-user.mts',
        'registry.test.mts',
        'widget.mock.mts',
        'catalog.generated.mts',
        'README.md',
        'my-message-tool.mts',
      ]),
    ).toEqual(['discover-topics.mts'])
  })

  it('accepts a registered name and one anonymous option source', () => {
    const anonymous = { schema: {} }
    const counts = anonymousMcpSourceCounts([{ options: [{ source: anonymous }] }])

    expect(
      isUnregisteredMcpToolFile(
        { schema: { name: 'discover_topics' } },
        new Set(['discover_topics']),
        counts,
      ),
    ).toBe(false)
    expect(isUnregisteredMcpToolFile(anonymous, new Set(), counts)).toBe(false)
  })

  it('rejects a missing export, an unknown name, and an anonymous source that is not unique', () => {
    const anonymous = { schema: {} }
    const counts = anonymousMcpSourceCounts([
      { options: [{ source: anonymous }, { source: anonymous }] },
    ])

    expect(isUnregisteredMcpToolFile(undefined, new Set(['discover_topics']), counts)).toBe(true)
    expect(
      isUnregisteredMcpToolFile(
        { schema: { name: 'missing_tool' } },
        new Set(['discover_topics']),
        counts,
      ),
    ).toBe(true)
    expect(isUnregisteredMcpToolFile(anonymous, new Set(), counts)).toBe(true)
    expect(isUnregisteredMcpToolFile({ schema: {} }, new Set(), counts)).toBe(true)
  })
})
