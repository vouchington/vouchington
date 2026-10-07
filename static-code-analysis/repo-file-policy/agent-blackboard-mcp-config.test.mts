import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

// vouchington-machines registers the `vouchington-tooling` MCP server, plugins, and marketplaces
// per machine in every harness and pre-approves its tools. No tracked repository file does.

const ROOT = resolve(import.meta.dirname, '../..')

const JSON_CONFIGS = [
  '.claude/settings.json',
  '.cursor/cli.json',
  '.cursor/permissions.json',
  'opencode.json',
]
const TOML_CONFIGS = ['.codex/config.toml']
const APPROVAL_FILES = [...JSON_CONFIGS, ...TOML_CONFIGS, '.codex/rules/default.rules']
const REGISTRATION_KEYS = ['enabledMcpjsonServers', 'mcp', 'mcpServers', 'mcp_servers']
// Registrations and approvals written for the retired `agent-blackboard` MCP tools, in every
// harness's spelling.
const RETIRED_TOOL_APPROVALS =
  /mcp__agent-blackboard__|Mcp\(agent-blackboard:|MCPTool\(agent-blackboard|agent-blackboard[_:](?:entry|session|snapshot)_?|agent-blackboard\.tools/u

// Tracked Git state, so an ignored or untracked file neither fails nor satisfies this guard.
function tracked(...paths: string[]): string[] {
  return execFileSync('git', ['ls-files', '-z', '--', ...paths], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

function readTracked(path: string): string {
  expect(tracked(path)).toEqual([path])
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function registrationKeys(config: unknown): string[] {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return []
  return REGISTRATION_KEYS.filter(key => key in config)
}

describe('no repository registers an MCP server', () => {
  it('tracks no MCP server file', () => {
    expect(tracked('.mcp.json', '.cursor/mcp.json', '.grok/config.toml')).toEqual([])
  })

  it('names no registration key in a harness config', () => {
    const named = [
      ...JSON_CONFIGS.map(path => [path, JSON.parse(readTracked(path))] as const),
      ...TOML_CONFIGS.map(path => [path, parse(readTracked(path))] as const),
    ].flatMap(([path, config]) => registrationKeys(config).map(key => `${path}: ${key}`))
    expect(named).toEqual([])
  })

  it('keeps no approval for a retired agent-blackboard MCP tool', () => {
    expect(APPROVAL_FILES.filter(path => RETIRED_TOOL_APPROVALS.test(readTracked(path)))).toEqual(
      [],
    )
  })

  it('deletes the replaced journal CLI and MCP wrapper with their permission entries', () => {
    expect(
      tracked('dev/blackboard-mcp', 'dev/blackboard-journal.mts', 'dev/blackboard-journal'),
    ).toEqual([])
    const stale = ['.claude/settings.json', '.codex/rules/default.rules'].filter(path =>
      /blackboard-journal|blackboard-mcp/u.test(readTracked(path)),
    )
    expect(stale).toEqual([])
  })

  it('recognizes each retired approval spelling', () => {
    for (const approval of [
      'mcp__agent-blackboard__entry_append',
      'Mcp(agent-blackboard:entry_get)',
      'MCPTool(agent-blackboard__session_ensure)',
      'agent-blackboard_snapshot_export',
      '[mcp_servers.agent-blackboard.tools.entry_append]',
    ]) {
      expect(RETIRED_TOOL_APPROVALS.test(approval)).toBe(true)
    }
    expect(RETIRED_TOOL_APPROVALS.test('Bash(pnpm exec agent-blackboard snapshot cleanup *)')).toBe(
      false,
    )
  })
})
