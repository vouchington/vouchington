import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export type McpLaunchHealth = { ok: true } | { ok: false; reason: string }

// The launch command in .mcp.json and every native harness config is
// `$(git rev-parse --show-toplevel)/node_modules/.bin/vouchington mcp`. `vouchington mcp` imports
// @modelcontextprotocol/sdk lazily from vouchington-tooling, so the launcher can exist while the
// server still cannot start. Checked statically: starting the server here would cost a process
// per session and prove nothing about the harness's own connection.
export function checkMcpLaunch(root: string): McpLaunchHealth {
  const launcher = join(root, 'node_modules', '.bin', 'vouchington')
  if (!existsSync(launcher)) return { ok: false, reason: `${launcher} does not exist` }
  try {
    const toolingManifest = createRequire(join(root, 'package.json')).resolve(
      'vouchington-tooling/package.json',
    )
    createRequire(toolingManifest).resolve('@modelcontextprotocol/sdk/server/mcp.js')
  } catch {
    return {
      ok: false,
      reason: '@modelcontextprotocol/sdk does not resolve from vouchington-tooling',
    }
  }
  return { ok: true }
}

export type McpRuntime = 'claude' | 'codex' | 'cursor' | 'grok'

type McpSurface = { note?: string; reconnect: string; tools: string }

// Each harness exposes the same server under its own names, and a few only behind a discovery
// tool, so a line naming another harness's form sends the agent looking for tools that do not
// exist. Only the headless and per-user approval wording is Cursor's: its server-load approval is
// separate from tool-call permissions (docs/development/harnesses/cursor.md).
const MCP_SURFACES: Record<McpRuntime, McpSurface> = {
  claude: { reconnect: '/mcp reconnect', tools: 'its mcp__vouchington-tooling__* tools' },
  codex: { reconnect: 'restart Codex', tools: 'its mcp__vouchington_tooling__* tools' },
  cursor: {
    note:
      'Cursor loads a project server only after a per-user approval: run ' +
      '`cursor-agent mcp enable vouchington-tooling` once, and pass --approve-mcps to every ' +
      'headless `cursor-agent -p` run.',
    reconnect: 'approve the server with `cursor-agent mcp enable vouchington-tooling`',
    tools:
      'its tools (Cursor defers them: find them with GetDynamicTools and call them with ' +
      'CallDynamicTool in the vouchington-tooling namespace)',
  },
  grok: {
    reconnect: 'restart Grok',
    tools: 'its vouchington-tooling__* tools (found with search_tool and called with use_tool)',
  },
}

const UNKNOWN_SURFACE: McpSurface = {
  note: 'This hook could not tell which harness is running: search for journal_append before concluding the server is missing.',
  reconnect:
    '/mcp reconnect (Claude Code), restart Codex or Grok, or approve the server with ' +
    '`cursor-agent mcp enable vouchington-tooling` (Cursor)',
  tools:
    'its tools (mcp__vouchington-tooling__* in Claude Code, mcp__vouchington_tooling__* in Codex, ' +
    'the vouchington-tooling namespace behind GetDynamicTools and CallDynamicTool in Cursor, ' +
    'vouchington-tooling__* behind search_tool and use_tool in Grok)',
}

export function renderMcpHealthLine(health: McpLaunchHealth, runtime?: McpRuntime): string {
  const surface = runtime === undefined ? UNKNOWN_SURFACE : MCP_SURFACES[runtime]
  const recovery = `run ./dev/initialize monorepo from the worktree root, then ${surface.reconnect}`
  if (health.ok) {
    const note = surface.note === undefined ? '' : ` ${surface.note}`
    return (
      'vouchington-tooling MCP server: launchable from this worktree (static check; the harness ' +
      `connection is not probed). If ${surface.tools} are missing, ${recovery}.${note}`
    )
  }
  return (
    `STOP WORK: the vouchington-tooling MCP server cannot launch (${health.reason}). This is a ` +
    `workspace-setup problem, not a deployment outage. Journal calls will fail and there is no CLI ` +
    `fallback: ${recovery}, and start a fresh session.`
  )
}
