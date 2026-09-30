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
  it('names ./dev/initialize and the harness-specific reconnect on failure', () => {
    const failed = { ok: false, reason: 'launcher missing' } as const
    const claude = renderMcpHealthLine(failed, 'claude')
    expect(claude).toContain('STOP WORK')
    expect(claude).toContain('./dev/initialize monorepo')
    expect(claude).toContain('then /mcp reconnect')
    expect(claude).not.toContain('restart Codex')
    const codex = renderMcpHealthLine(failed, 'codex')
    expect(codex).toContain('then restart Codex')
    expect(renderMcpHealthLine(failed)).toContain('/mcp reconnect (Claude Code) or restart Codex')
  })

  it('reports a static pass without claiming the harness is connected', () => {
    const line = renderMcpHealthLine({ ok: true }, 'claude')
    expect(line).not.toContain('STOP WORK')
    expect(line).toContain('static check')
    expect(line).toContain('mcp__vouchington-tooling__*')
  })
})
