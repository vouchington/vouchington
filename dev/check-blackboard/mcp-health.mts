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

function reconnectStep(harness: string | undefined): string {
  if (harness === 'claude') return '/mcp reconnect'
  if (harness === 'codex') return 'restart Codex'
  return '/mcp reconnect (Claude Code) or restart Codex'
}

export function renderMcpHealthLine(health: McpLaunchHealth, harness?: string): string {
  const recovery = `run ./dev/initialize monorepo from the worktree root, then ${reconnectStep(harness)}`
  if (health.ok) {
    return (
      'vouchington-tooling MCP server: launchable from this worktree (static check; the harness ' +
      `connection is not probed). If its mcp__vouchington-tooling__* tools are missing, ${recovery}.`
    )
  }
  return (
    `STOP WORK: the vouchington-tooling MCP server cannot launch (${health.reason}). This is a ` +
    `workspace-setup problem, not a deployment outage. Journal calls will fail and there is no CLI ` +
    `fallback: ${recovery}, and start a fresh session.`
  )
}
