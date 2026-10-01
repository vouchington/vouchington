import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { checkMcpLaunch, renderMcpHealthLine, type McpLaunchHealth } from './mcp-health.mts'

const testDirs: string[] = []
const healthModule = fileURLToPath(new URL('./mcp-health.mts', import.meta.url))

// `pnpm exec` exports NODE_PATH with the worktree's hoisted dependencies, which would let the
// negative cases resolve the real sdk; a clean child process sees only the fixture's own tree.
function checkWithoutAmbientResolution(root: string): McpLaunchHealth {
  const script = `import { checkMcpLaunch } from ${JSON.stringify(healthModule)}
process.stdout.write(JSON.stringify(checkMcpLaunch(process.argv[1])))`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  })
  return JSON.parse(result.stdout) as McpLaunchHealth
}

async function makeRoot(options: {
  launcher: boolean
  sdk: boolean
  tooling?: boolean
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'check-blackboard-health-'))
  testDirs.push(root)
  const modules = join(root, 'node_modules')
  await writeFile(join(root, 'package.json'), '{}')
  await mkdir(join(modules, '.bin'), { recursive: true })
  if (options.tooling !== false) {
    await mkdir(join(modules, 'vouchington-tooling'), { recursive: true })
    await writeFile(
      join(modules, 'vouchington-tooling', 'package.json'),
      JSON.stringify({ name: 'vouchington-tooling', version: '0.0.0' }),
    )
  }
  if (options.launcher) {
    await writeFile(join(modules, '.bin', 'vouchington'), '#!/bin/sh\n')
  }
  if (options.sdk) {
    const sdk = join(modules, '@modelcontextprotocol', 'sdk')
    await mkdir(join(sdk, 'server'), { recursive: true })
    await writeFile(
      join(sdk, 'package.json'),
      JSON.stringify({
        name: '@modelcontextprotocol/sdk',
        exports: { './server/mcp.js': './server/mcp.js' },
      }),
    )
    await writeFile(join(sdk, 'server', 'mcp.js'), 'export {}\n')
  }
  return root
}

describe('checkMcpLaunch', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('accepts a launcher whose tooling package can resolve the sdk', async () => {
    expect(checkMcpLaunch(await makeRoot({ launcher: true, sdk: true }))).toEqual({ ok: true })
  })

  it('rejects a missing launcher', async () => {
    const health = checkMcpLaunch(await makeRoot({ launcher: false, sdk: true }))
    expect(health).toMatchObject({ ok: false })
    expect(health.ok ? '' : health.reason).toContain('node_modules/.bin/vouchington')
  })

  it('rejects an unresolvable sdk even when the launcher exists', async () => {
    const health = checkWithoutAmbientResolution(await makeRoot({ launcher: true, sdk: false }))
    expect(health.ok ? '' : health.reason).toContain('@modelcontextprotocol/sdk')
  })

  it('rejects a root without the tooling package', async () => {
    const root = await makeRoot({ launcher: true, sdk: false, tooling: false })
    expect(checkWithoutAmbientResolution(root).ok).toBe(false)
  })
})

describe('renderMcpHealthLine', () => {
  const failed = { ok: false, reason: 'launcher missing' } as const
  const passed = { ok: true } as const

  it('names ./dev/initialize and the harness-specific reconnect on failure', () => {
    const claude = renderMcpHealthLine(failed, 'claude')
    expect(claude).toContain('STOP WORK')
    expect(claude).toContain('./dev/initialize monorepo')
    expect(claude).toContain('then /mcp reconnect')
    expect(claude).not.toContain('restart Codex')
    expect(renderMcpHealthLine(failed, 'codex')).toContain('then restart Codex')
    expect(renderMcpHealthLine(failed, 'grok')).toContain('then restart Grok')
    expect(renderMcpHealthLine(failed, 'cursor')).toContain(
      'then approve the server with `cursor-agent mcp enable vouchington-tooling`',
    )
  })

  it('reports a static pass without claiming the harness is connected', () => {
    const line = renderMcpHealthLine(passed, 'claude')
    expect(line).not.toContain('STOP WORK')
    expect(line).toContain('static check')
    expect(line).toContain('not probed')
  })

  it('names only the tool form the running harness exposes', () => {
    const claude = renderMcpHealthLine(passed, 'claude')
    expect(claude).toContain('mcp__vouchington-tooling__*')
    expect(claude).not.toContain('mcp__vouchington_tooling__*')
    const codex = renderMcpHealthLine(passed, 'codex')
    expect(codex).toContain('mcp__vouchington_tooling__*')
    expect(codex).not.toContain('mcp__vouchington-tooling__*')
    const grok = renderMcpHealthLine(passed, 'grok')
    expect(grok).toContain('vouchington-tooling__*')
    expect(grok).toContain('search_tool')
    expect(grok).toContain('use_tool')
    expect(grok).not.toContain('mcp__')
    const cursor = renderMcpHealthLine(passed, 'cursor')
    expect(cursor).toContain('GetDynamicTools')
    expect(cursor).toContain('CallDynamicTool')
    expect(cursor).toContain('vouchington-tooling namespace')
    expect(cursor).not.toContain('mcp__')
  })

  it('explains the Cursor server approval and the headless flag', () => {
    const cursor = renderMcpHealthLine(passed, 'cursor')
    expect(cursor).toContain('cursor-agent mcp enable vouchington-tooling')
    expect(cursor).toContain('--approve-mcps')
    expect(renderMcpHealthLine(passed, 'claude')).not.toContain('--approve-mcps')
  })

  it('names all four forms and the discovery search when the runtime is unknown', () => {
    const line = renderMcpHealthLine(passed)
    for (const form of [
      'mcp__vouchington-tooling__*',
      'mcp__vouchington_tooling__*',
      'GetDynamicTools',
      'vouchington-tooling__* behind search_tool and use_tool',
      'search for journal_append before concluding the server is missing',
    ]) {
      expect(line).toContain(form)
    }
    expect(renderMcpHealthLine(failed)).toContain(
      '/mcp reconnect (Claude Code), restart Codex or Grok',
    )
  })
})
