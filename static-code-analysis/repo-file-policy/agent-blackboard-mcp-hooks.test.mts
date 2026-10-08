import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const MCP_TOOL_NAMES = [
  'journal_append',
  'journal_entries',
  'outbox_status',
  'outbox_flush',
  'session_ensure',
  'snapshot_export',
  'session_archive',
].map(tool => `mcp__vouchington-tooling__${tool}`)

type HookGroup = { matcher?: unknown }

function hookGroups(source: unknown, event: string): HookGroup[] {
  const hooks = (source as { hooks?: Record<string, unknown> }).hooks
  const groups = hooks?.[event]
  return Array.isArray(groups) ? (groups as HookGroup[]) : []
}

// Claude Code and Codex treat a missing, empty, or `*` matcher as matching every tool and any
// other matcher as a regular expression. The unanchored test is a superset of the anchored
// pipe-list form, so a false here means neither form can match.
function matcherCovers(matcher: unknown, toolName: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  return typeof matcher === 'string' && new RegExp(matcher, 'u').test(toolName)
}

describe('MCP calls stay outside the Bash-oriented PreToolUse gates', () => {
  it('treats absent, empty, and star matchers as match-all', () => {
    for (const matcher of [undefined, '', '*', 'mcp__.*', '.*']) {
      expect(matcherCovers(matcher, MCP_TOOL_NAMES[0] ?? '')).toBe(true)
    }
    expect(matcherCovers('Bash|Edit|Write|apply_patch', MCP_TOOL_NAMES[0] ?? '')).toBe(false)
  })

  it('matches no MCP tool from any Claude or Codex PreToolUse matcher', () => {
    const claude: unknown = JSON.parse(readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8'))
    const codex: unknown = parse(readFileSync(resolve(ROOT, '.codex/config.toml'), 'utf8'))
    const groups = [...hookGroups(claude, 'PreToolUse'), ...hookGroups(codex, 'PreToolUse')]
    expect(groups.length).toBeGreaterThan(1)
    const covering = groups.flatMap(group =>
      MCP_TOOL_NAMES.filter(toolName => matcherCovers(group.matcher, toolName)).map(
        toolName => `${String(group.matcher)} vs ${toolName}`,
      ),
    )
    expect(covering).toEqual([])
  })

  it('has no PreToolUse matcher that names mcp__ at all', () => {
    const claude = readFileSync(resolve(ROOT, '.claude/settings.json'), 'utf8')
    const codex = readFileSync(resolve(ROOT, '.codex/config.toml'), 'utf8')
    const matchers = [
      ...claude.matchAll(/"matcher":\s*"([^"]*)"/gu),
      ...codex.matchAll(/^matcher = "([^"]*)"/gmu),
    ]
    expect(matchers.length).toBeGreaterThan(2)
    expect(matchers.filter(([, matcher]) => matcher?.includes('mcp__'))).toEqual([])
  })
})
