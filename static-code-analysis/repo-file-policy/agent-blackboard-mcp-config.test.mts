import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRepoFixture } from '../test-helpers/config-inventory/repo-fixture.mts'
import { checkAgentBlackboardMcpConfig } from './agent-blackboard-mcp-config.mts'

const required = { '.claude/settings.json': '{}', '.codex/rules/default.rules': '' }

describe('machine-owned MCP configuration policy', () => {
  const roots: string[] = []
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })
  async function fixture(files: Record<string, string> = {}) {
    const result = await makeRepoFixture({ ...required, ...files })
    roots.push(result.dir)
    return result.ctx
  }

  it('allows ordinary project policy, CLI approvals, and unrelated nested data', async () => {
    const ctx = await fixture({
      '.grok/config.toml': 'model = "fixture"\n',
      '.cursor/cli.json': '{"permissions":{"mcp":"unrelated nested data"}}',
      '.codex/rules/default.rules': 'Bash(pnpm exec agent-blackboard snapshot cleanup *)',
      'other/config.json': '{"mcpServers":{}}',
    })
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([])
  })

  it.each([
    '.mcp.json',
    '.cursor/mcp.json',
    'dev/blackboard-mcp',
    'dev/blackboard-journal.mts',
    'dev/blackboard-journal',
    'dev/blackboard-mcp/child.mts',
  ])('rejects tracked registration or replaced wrapper %s', async path => {
    const ctx = await fixture({ [path]: '{}' })
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([
      `${path}: repository MCP registration and replaced journal wrappers are forbidden`,
    ])
  })

  it.each([
    ['.claude/settings.json', '{"enabledMcpjsonServers":[]}'],
    ['.cursor/cli.json', '{"mcp":{}}'],
    ['.cursor/permissions.json', '{"mcpServers":{}}'],
    ['opencode.json', '{"mcp_servers":{}}'],
    ['.codex/config.toml', '[mcp_servers.fixture]\ncommand="fixture"'],
    ['.grok/config.toml', '[mcp.fixture]\ncommand="fixture"'],
  ])('rejects registration in intended config %s', async (path, source) => {
    expect(checkAgentBlackboardMcpConfig(await fixture({ [path]: source }))).toEqual([
      expect.stringContaining(`${path}: repository MCP registration key`),
    ])
  })

  it.each([
    'mcp__agent-blackboard__entry_append',
    'Mcp(agent-blackboard:entry_get)',
    'MCPTool(agent-blackboard__session_ensure)',
    'agent-blackboard_snapshot_export',
    '[mcp_servers.agent-blackboard.tools.entry_append]',
  ])('rejects retired approval spelling %s', async source => {
    expect(
      checkAgentBlackboardMcpConfig(await fixture({ '.codex/rules/default.rules': source })),
    ).toEqual(['.codex/rules/default.rules: retired agent-blackboard MCP approval is forbidden'])
  })

  it('rejects replaced wrapper approvals in each required permission file', async () => {
    const ctx = await fixture({
      '.claude/settings.json': '{"allow":["blackboard-journal"]}',
      '.codex/rules/default.rules': 'Bash(dev/blackboard-mcp *)',
    })
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([
      '.claude/settings.json: replaced journal wrapper approval is forbidden',
      '.codex/rules/default.rules: replaced journal wrapper approval is forbidden',
    ])
  })

  it('ignores untracked registration files and does not accept untracked required permissions', async () => {
    const ctx = await fixture({ '.mcp.json': '{}', '.grok/config.toml': '[mcp.fixture]' })
    ctx.trackedFiles = Object.keys(required)
    ctx.trackedFileSet = new Set(ctx.trackedFiles)
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([])
    ctx.trackedFiles = ['.codex/rules/default.rules']
    ctx.trackedFileSet = new Set(ctx.trackedFiles)
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([
      '.claude/settings.json: required tracked configuration file is missing',
    ])
  })

  it.each([
    ['.claude/settings.json', '{'],
    ['.grok/config.toml', '[invalid'],
  ])('fails closed on invalid tracked config %s', async (path, source) => {
    expect(checkAgentBlackboardMcpConfig(await fixture({ [path]: source }))).toEqual([
      `${path}: tracked configuration is invalid`,
    ])
  })

  it('fails closed on non-text shared reader results and config paths replaced by directories', async () => {
    const ctx = await fixture({ '.cursor/cli.json/child': '{}' })
    ctx.readTrackedFile = () => null
    expect(checkAgentBlackboardMcpConfig(ctx)).toEqual([
      '.claude/settings.json: tracked configuration is unreadable',
      '.cursor/cli.json: required tracked configuration file is missing',
      '.codex/rules/default.rules: tracked configuration is unreadable',
    ])
  })
})
