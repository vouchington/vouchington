import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const TOOL_NAMES = [
  'entry_append',
  'entry_get',
  'session_archive',
  'session_create',
  'session_ensure',
  'session_patch',
  'session_search',
  'snapshot_export',
] as const

type NormalizedServer = {
  args: string[]
  command: string
  envNames: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message)
  return value
}

function requireStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error(message)
  }
  return value
}

function expectExactTools(actual: string[], makeName: (toolName: string) => string) {
  expect(actual.toSorted()).toEqual(TOOL_NAMES.map(makeName).toSorted())
}

function normalizeCodexServer(source: string): NormalizedServer {
  const parsed: unknown = parse(source)
  const servers = isRecord(parsed) ? parsed.mcp_servers : undefined
  const server = isRecord(servers) ? servers['agent-blackboard'] : undefined
  if (!isRecord(server)) throw new Error('missing mcp_servers.agent-blackboard')
  if (typeof server.command !== 'string') throw new Error('invalid Codex MCP command')
  const args = requireStringArray(server.args, 'invalid Codex MCP args')
  const envNames = requireStringArray(server.env_vars, 'invalid Codex MCP env_vars')
  if (server.required !== undefined && typeof server.required !== 'boolean') {
    throw new Error('invalid Codex MCP required value')
  }
  if (server.required === true) {
    throw new Error('agent-blackboard must not be required before dependencies are installed')
  }
  const tools = requireRecord(server.tools, 'missing Codex MCP tool approvals')
  expect(Object.keys(tools).toSorted()).toEqual([...TOOL_NAMES].toSorted())
  for (const toolName of TOOL_NAMES) {
    expect(requireRecord(tools[toolName], `missing Codex approval for ${toolName}`)).toEqual({
      approval_mode: 'approve',
    })
  }
  return { args, command: server.command, envNames: envNames.toSorted() }
}

function normalizeSharedServer(
  source: string,
  expectedEnvValue: (name: string) => string = name => `\${${name}}`,
): NormalizedServer {
  const parsed: unknown = JSON.parse(source)
  const servers = isRecord(parsed) ? parsed.mcpServers : undefined
  const server = isRecord(servers) ? servers['agent-blackboard'] : undefined
  if (!isRecord(server)) throw new Error('missing mcpServers.agent-blackboard')
  if (typeof server.command !== 'string') throw new Error('invalid shared MCP command')
  const args = requireStringArray(server.args, 'invalid shared MCP args')
  const env = requireRecord(server.env, 'invalid shared MCP env')
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== 'string') throw new Error(`shared MCP env ${name} must be a string`)
    if (value !== expectedEnvValue(name)) {
      throw new Error(`shared MCP env ${name} must forward itself`)
    }
  }
  return { args, command: server.command, envNames: Object.keys(env).toSorted() }
}

function normalizeCursorServer(source: string): NormalizedServer {
  return normalizeSharedServer(source, name => `\${env:${name}}`)
}

function json(path: string): Record<string, unknown> {
  return requireRecord(JSON.parse(readFileSync(path, 'utf8')), `invalid JSON: ${path}`)
}

describe('agent-blackboard MCP configuration', () => {
  it('rejects a missing Codex registration', () => {
    expect(() => normalizeCodexServer('[features]\nhooks = true\n')).toThrow(
      'missing mcp_servers.agent-blackboard',
    )
  })

  it('rejects a non-string shared environment value', () => {
    expect(() =>
      normalizeSharedServer(`{
        "mcpServers": {
          "agent-blackboard": {
            "command": "./dev/blackboard-mcp",
            "args": [],
            "env": { "AGENT_BLACKBOARD_URL": 42 }
          }
        }
      }`),
    ).toThrow('shared MCP env AGENT_BLACKBOARD_URL must be a string')
  })

  it('rejects a required Codex registration', () => {
    expect(() =>
      normalizeCodexServer(`
[mcp_servers.agent-blackboard]
command = "./dev/blackboard-mcp"
args = []
env_vars = ["AGENT_BLACKBOARD_URL", "AGENT_BLACKBOARD_TOKEN"]
required = true

[mcp_servers.agent-blackboard.tools.entry_append]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.entry_get]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.session_archive]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.session_create]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.session_ensure]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.session_patch]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.session_search]
approval_mode = "approve"

[mcp_servers.agent-blackboard.tools.snapshot_export]
approval_mode = "approve"
`),
    ).toThrow('agent-blackboard must not be required before dependencies are installed')
  })

  it('keeps every harness registration and preauthorization exact', () => {
    const root = resolve(import.meta.dirname, '../..')
    const configPaths = [
      '.claude/settings.json',
      '.codex/config.toml',
      '.cursor/cli.json',
      '.cursor/mcp.json',
      '.cursor/permissions.json',
      '.grok/config.toml',
      '.mcp.json',
      'opencode.json',
    ]
    expect(configPaths.every(path => existsSync(resolve(root, path)))).toBe(true)
    const trackedConfigPaths = execFileSync('git', ['ls-files', '-z', '--', ...configPaths], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
    expect(trackedConfigPaths.toSorted()).toEqual(configPaths.toSorted())

    const codex = normalizeCodexServer(readFileSync(resolve(root, '.codex/config.toml'), 'utf8'))
    const shared = normalizeSharedServer(readFileSync(resolve(root, '.mcp.json'), 'utf8'))
    expect(codex).toEqual(shared)

    const claude = json(resolve(root, '.claude/settings.json'))
    expect(claude.enabledMcpjsonServers).toEqual(['agent-blackboard'])
    const claudePermissions = requireRecord(claude.permissions, 'missing Claude permissions')
    expectExactTools(
      requireStringArray(claudePermissions.allow, 'invalid Claude allowlist').filter(tool =>
        tool.startsWith('mcp__agent-blackboard__'),
      ),
      toolName => `mcp__agent-blackboard__${toolName}`,
    )

    const cursorMcp = normalizeCursorServer(readFileSync(resolve(root, '.cursor/mcp.json'), 'utf8'))
    expect(cursorMcp).toEqual(shared)
    const cursorCli = requireRecord(
      json(resolve(root, '.cursor/cli.json')).permissions,
      'missing Cursor CLI permissions',
    )
    expectExactTools(
      requireStringArray(cursorCli.allow, 'invalid Cursor CLI allowlist').filter(tool =>
        tool.startsWith('Mcp(agent-blackboard:'),
      ),
      toolName => `Mcp(agent-blackboard:${toolName})`,
    )
    const cursorPermissions = json(resolve(root, '.cursor/permissions.json'))
    expectExactTools(
      requireStringArray(cursorPermissions.mcpAllowlist, 'invalid Cursor MCP allowlist'),
      toolName => `agent-blackboard:${toolName}`,
    )

    const grok = requireRecord(
      parse(readFileSync(resolve(root, '.grok/config.toml'), 'utf8')),
      'invalid Grok config',
    )
    const grokServers = requireRecord(grok.mcp_servers, 'missing Grok MCP registration')
    const grokServer = requireRecord(
      grokServers['agent-blackboard'],
      'missing Grok agent-blackboard',
    )
    expect(grokServer).toMatchObject({
      args: shared.args,
      command: shared.command,
      enabled: true,
      env: {
        AGENT_BLACKBOARD_TOKEN: '${AGENT_BLACKBOARD_TOKEN}',
        AGENT_BLACKBOARD_URL: '${AGENT_BLACKBOARD_URL}',
      },
    })
    const grokPermissions = requireRecord(grok.permission, 'missing Grok permissions')
    expectExactTools(
      requireStringArray(grokPermissions.allow, 'invalid Grok MCP allowlist'),
      toolName => `MCPTool(agent-blackboard__${toolName})`,
    )

    const openCode = json(resolve(root, 'opencode.json'))
    const openCodeMcp = requireRecord(openCode.mcp, 'missing OpenCode MCP registration')
    expect(
      requireRecord(openCodeMcp['agent-blackboard'], 'missing OpenCode agent-blackboard'),
    ).toEqual({
      command: [shared.command, ...shared.args],
      enabled: true,
      type: 'local',
    })
    const openCodePermissions = requireRecord(openCode.permission, 'missing OpenCode permissions')
    expectExactTools(
      Object.entries(openCodePermissions)
        .filter(([, value]) => value === 'allow')
        .map(([toolName]) => toolName)
        .filter(toolName => toolName.startsWith('agent-blackboard_')),
      toolName => `agent-blackboard_${toolName}`,
    )
  })

  it('launches the native registrations from a nested repository cwd', () => {
    const root = resolve(import.meta.dirname, '../..')
    const configs = [
      normalizeCodexServer(readFileSync(resolve(root, '.codex/config.toml'), 'utf8')),
      normalizeCursorServer(readFileSync(resolve(root, '.cursor/mcp.json'), 'utf8')),
    ]
    for (const config of configs) {
      const stdout = execFileSync(
        'bash',
        ['-c', 'exec "$@"', '--', config.command, ...config.args],
        {
          cwd: resolve(root, 'web'),
          encoding: 'utf8',
          env: {
            ...process.env,
            AGENT_BLACKBOARD_URL: 'https://example.invalid/',
            AGENT_BLACKBOARD_TOKEN: 'test-token',
          },
          input: '',
        },
      )

      expect(stdout).toBe('')
    }
  })
})
