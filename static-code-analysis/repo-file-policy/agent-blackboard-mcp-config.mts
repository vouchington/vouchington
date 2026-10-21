import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import type { SharedContext } from 'vouchington-tooling/shared-context'

const JSON_CONFIGS = [
  '.claude/settings.json',
  '.cursor/cli.json',
  '.cursor/permissions.json',
  'opencode.json',
]
const TOML_CONFIGS = ['.codex/config.toml', '.grok/config.toml']
const REQUIRED_APPROVAL_FILES = ['.claude/settings.json', '.codex/rules/default.rules']
const APPROVAL_FILES = [...JSON_CONFIGS, ...TOML_CONFIGS, '.codex/rules/default.rules']
const REGISTRATION_KEYS = ['enabledMcpjsonServers', 'mcp', 'mcpServers', 'mcp_servers']
const RETIRED_TOOL_APPROVALS =
  /mcp__agent-blackboard__|Mcp\(agent-blackboard:|MCPTool\(agent-blackboard|agent-blackboard[_:](?:entry|session|snapshot)_?|agent-blackboard\.tools/u

/** Machine configuration owns MCP registration; the repository only owns hook policy. */
export function checkAgentBlackboardMcpConfig(ctx: SharedContext): string[] {
  const errors: string[] = []
  for (const forbidden of [
    '.mcp.json',
    '.cursor/mcp.json',
    'dev/blackboard-mcp',
    'dev/blackboard-journal.mts',
    'dev/blackboard-journal',
  ]) {
    for (const file of ctx.trackedFiles) {
      if (file === forbidden || file.startsWith(`${forbidden}/`))
        errors.push(
          `${file}: repository MCP registration and replaced journal wrappers are forbidden`,
        )
    }
  }
  const sources = new Map<string, string>()
  for (const file of APPROVAL_FILES) {
    if (!ctx.trackedFileSet.has(file)) {
      if (
        REQUIRED_APPROVAL_FILES.includes(file) ||
        ctx.trackedFiles.some(path => path.startsWith(`${file}/`))
      )
        errors.push(`${file}: required tracked configuration file is missing`)
      continue
    }
    try {
      const source = ctx.readTrackedFile
        ? ctx.readTrackedFile(file)
        : readFileSync(join(ctx.repoRoot, file), 'utf8')
      if (typeof source !== 'string') throw new Error('unreadable configuration')
      sources.set(file, source)
      if (RETIRED_TOOL_APPROVALS.test(source))
        errors.push(`${file}: retired agent-blackboard MCP approval is forbidden`)
      if (
        REQUIRED_APPROVAL_FILES.includes(file) &&
        /blackboard-journal|blackboard-mcp/u.test(source)
      )
        errors.push(`${file}: replaced journal wrapper approval is forbidden`)
    } catch {
      errors.push(`${file}: tracked configuration is unreadable`)
    }
  }
  for (const file of [...JSON_CONFIGS, ...TOML_CONFIGS]) {
    const source = sources.get(file)
    if (source === undefined) continue
    try {
      const config: unknown = JSON_CONFIGS.includes(file) ? JSON.parse(source) : parse(source)
      if (typeof config !== 'object' || config === null || Array.isArray(config)) continue
      for (const key of REGISTRATION_KEYS) {
        if (key in config)
          errors.push(`${file}: repository MCP registration key ${key} is forbidden`)
      }
    } catch {
      errors.push(`${file}: tracked configuration is invalid`)
    }
  }
  return errors
}
