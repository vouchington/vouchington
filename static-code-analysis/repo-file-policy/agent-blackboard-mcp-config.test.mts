import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const SERVER = 'vouchington-tooling'
// The seven tools `vouchington mcp` serves. Only the harnesses whose docs do not confirm a
// server-wide wildcard for approvals list them one by one (OpenCode).
const TOOL_NAMES = [
  'journal_append',
  'journal_entries',
  'outbox_status',
  'outbox_flush',
  'session_ensure',
  'snapshot_export',
  'session_archive',
] as const
const LAUNCH = 'exec "$(git rev-parse --show-toplevel)/node_modules/.bin/vouchington" mcp'
const ROOT = resolve(import.meta.dirname, '../..')

type NormalizedServer = { args: string[]; command: string; envNames: string[] }

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

function json(path: string): Record<string, unknown> {
  return requireRecord(
    JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')),
    `invalid JSON: ${path}`,
  )
}

function toml(path: string): Record<string, unknown> {
  return requireRecord(parse(readFileSync(resolve(ROOT, path), 'utf8')), `invalid TOML: ${path}`)
}

// The one blackboard server: no other registration may mention the blackboard or the tooling.
function expectOnlyToolingServer(servers: unknown, message: string): Record<string, unknown> {
  const registered = requireRecord(servers, message)
  const names = Object.keys(registered).filter(name => /blackboard|tooling/iu.test(name))
  if (names.length !== 1 || names[0] !== SERVER) {
    throw new Error(`expected only ${SERVER}, found: ${names.join(', ') || 'none'}`)
  }
  return requireRecord(registered[SERVER], message)
}

function normalizeCodexServer(source: string): NormalizedServer {
  const parsed: unknown = parse(source)
  const servers = isRecord(parsed) ? parsed.mcp_servers : undefined
  const server = expectOnlyToolingServer(servers, `missing mcp_servers.${SERVER}`)
  if (typeof server.command !== 'string') throw new Error('invalid Codex MCP command')
  const args = requireStringArray(server.args, 'invalid Codex MCP args')
  const envNames = requireStringArray(server.env_vars, 'invalid Codex MCP env_vars')
  if (server.required === true) {
    throw new Error(`${SERVER} must not be required before dependencies are installed`)
  }
  if (server.default_tools_approval_mode !== 'approve') {
    throw new Error('Codex must approve the whole server with default_tools_approval_mode')
  }
  if (server.tools !== undefined) throw new Error('Codex must not list per-tool approvals')
  return { args, command: server.command, envNames: envNames.toSorted() }
}

function normalizeSharedServer(
  source: string,
  expectedEnvValue: (name: string) => string = name => `\${${name}}`,
): NormalizedServer {
  const parsed: unknown = JSON.parse(source)
  const servers = isRecord(parsed) ? parsed.mcpServers : undefined
  const server = expectOnlyToolingServer(servers, `missing mcpServers.${SERVER}`)
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

describe('vouchington-tooling MCP configuration', () => {
  it('rejects a missing Codex registration', () => {
    expect(() => normalizeCodexServer('[features]\nhooks = true\n')).toThrow(
      `missing mcp_servers.${SERVER}`,
    )
  })

  it('rejects a second blackboard server beside vouchington-tooling', () => {
    expect(() =>
      normalizeSharedServer(`{"mcpServers": {
        "${SERVER}": {"command": "bash", "args": [], "env": {}},
        "agent-blackboard": {"command": "bash", "args": [], "env": {}}
      }}`),
    ).toThrow(/expected only vouchington-tooling, found: .*agent-blackboard/u)
  })

  it('rejects a non-string shared environment value', () => {
    expect(() =>
      normalizeSharedServer(`{
        "mcpServers": {
          "${SERVER}": { "command": "bash", "args": [], "env": { "AGENT_BLACKBOARD_URL": 42 } }
        }
      }`),
    ).toThrow('shared MCP env AGENT_BLACKBOARD_URL must be a string')
  })

  it('rejects a required or per-tool-approved Codex registration', () => {
    const base = `
[mcp_servers.${SERVER}]
command = "bash"
args = []
env_vars = ["AGENT_BLACKBOARD_URL", "AGENT_BLACKBOARD_TOKEN"]
default_tools_approval_mode = "approve"
`
    expect(() => normalizeCodexServer(`${base}required = true\n`)).toThrow(
      `${SERVER} must not be required before dependencies are installed`,
    )
    expect(() =>
      normalizeCodexServer(
        `${base}\n[mcp_servers.${SERVER}.tools.journal_append]\napproval_mode = "approve"\n`,
      ),
    ).toThrow('Codex must not list per-tool approvals')
    expect(() => normalizeCodexServer(base.replace('"approve"', '"prompt"'))).toThrow(
      'Codex must approve the whole server',
    )
  })

  it('tracks every harness config file', () => {
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
    expect(configPaths.every(path => existsSync(resolve(ROOT, path)))).toBe(true)
    const tracked = execFileSync('git', ['ls-files', '-z', '--', ...configPaths], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean)
    expect(tracked.toSorted()).toEqual(configPaths.toSorted())
  })

  it('registers one identical launch command in every harness', () => {
    const shared = normalizeSharedServer(readFileSync(resolve(ROOT, '.mcp.json'), 'utf8'))
    expect(shared).toEqual({
      args: ['-c', LAUNCH],
      command: 'bash',
      envNames: ['AGENT_BLACKBOARD_TOKEN', 'AGENT_BLACKBOARD_URL'],
    })
    expect(normalizeCodexServer(readFileSync(resolve(ROOT, '.codex/config.toml'), 'utf8'))).toEqual(
      shared,
    )
    expect(normalizeCursorServer(readFileSync(resolve(ROOT, '.cursor/mcp.json'), 'utf8'))).toEqual(
      shared,
    )
    const grokServers = toml('.grok/config.toml').mcp_servers
    expect(expectOnlyToolingServer(grokServers, 'missing Grok MCP registration')).toMatchObject({
      args: shared.args,
      command: shared.command,
      enabled: true,
      env: {
        AGENT_BLACKBOARD_TOKEN: '${AGENT_BLACKBOARD_TOKEN}',
        AGENT_BLACKBOARD_URL: '${AGENT_BLACKBOARD_URL}',
      },
    })
    const openCodeServer = expectOnlyToolingServer(
      json('opencode.json').mcp,
      'missing OpenCode MCP',
    )
    expect(openCodeServer).toEqual({
      command: [shared.command, ...shared.args],
      enabled: true,
      type: 'local',
    })
  })

  it('approves the whole server, never single tools, in each harness that supports it', () => {
    const claude = json('.claude/settings.json')
    expect(claude.enabledMcpjsonServers).toEqual([SERVER])
    const allow = requireStringArray(
      requireRecord(claude.permissions, 'missing Claude permissions').allow,
      'invalid Claude allowlist',
    )
    expect(
      allow.filter(tool => tool.startsWith('mcp__') && /tooling|blackboard/u.test(tool)),
    ).toEqual([`mcp__${SERVER}__*`])

    const cursorCli = requireRecord(json('.cursor/cli.json').permissions, 'missing Cursor CLI')
    expect(
      requireStringArray(cursorCli.allow, 'invalid Cursor CLI allowlist').filter(tool =>
        tool.startsWith('Mcp('),
      ),
    ).toEqual([`Mcp(${SERVER}:*)`])
    expect(json('.cursor/permissions.json').mcpAllowlist).toEqual([`${SERVER}:*`])

    const grokPermissions = requireRecord(
      toml('.grok/config.toml').permission,
      'missing Grok rules',
    )
    expect(grokPermissions.allow).toEqual([`MCPTool(${SERVER}__*)`])
  })

  it('lists the seven tools for OpenCode, whose docs do not confirm a wildcard', () => {
    const permissions = requireRecord(json('opencode.json').permission, 'missing OpenCode rules')
    expect(Object.values(permissions).every(value => value === 'allow')).toBe(true)
    expect(Object.keys(permissions).toSorted()).toEqual(
      TOOL_NAMES.map(tool => `${SERVER}_${tool}`).toSorted(),
    )
  })

  it('launches the native registrations from a nested repository cwd', () => {
    const configs = [
      normalizeCodexServer(readFileSync(resolve(ROOT, '.codex/config.toml'), 'utf8')),
      normalizeCursorServer(readFileSync(resolve(ROOT, '.cursor/mcp.json'), 'utf8')),
    ]
    for (const config of configs) {
      const stdout = execFileSync(
        'bash',
        ['-c', 'exec "$@"', '--', config.command, ...config.args],
        {
          cwd: resolve(ROOT, 'web'),
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
