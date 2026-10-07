import { createHash } from 'node:crypto'
import { execFile as execFileCallback } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFile = promisify(execFileCallback)
const scriptPath = resolve('ci/allocate-browser-safe-ports.py')
const lockedVersion = '0.0.0-allocator-test'
const allocatorFiles = ['fetch-forbidden-ports.json', 'runner-port-policy.json']

// Stands in for the published allocator: reports its arguments and the files beside it.
const stubAllocator = (label: string) => `import json, sys
from pathlib import Path
here = Path(__file__).resolve().parent
print(json.dumps({"label": "${label}", "args": sys.argv[1:], "files": sorted(p.name for p in here.iterdir())}))
`

function parsePorts(stdout: string): number[] {
  return stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(port => Number.parseInt(port, 10))
}

const roots: string[] = []

// A workspace with the wrapper, a lockfile pinning the stub package, a file:// registry holding
// its tarball, and a PATH with python3 alone: no node, pnpm, or npm.
async function stubWorkspace(options: { lockedIntegrity?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-allocator-'))
  roots.push(root)
  const repo = join(root, 'repo')
  await mkdir(join(repo, 'ci'), { recursive: true })
  await copyFile(scriptPath, join(repo, 'ci/allocate-browser-safe-ports.py'))

  const scripts = join(root, 'package/package/scripts')
  await mkdir(scripts, { recursive: true })
  await writeFile(join(scripts, 'allocate-browser-safe-ports.py'), stubAllocator('registry'))
  for (const name of allocatorFiles) await writeFile(join(scripts, name), '[]')
  const tarballDir = join(root, 'registry/vouchington-tooling/-')
  await mkdir(tarballDir, { recursive: true })
  const tarball = join(tarballDir, `vouchington-tooling-${lockedVersion}.tgz`)
  await execFile('tar', ['-czf', tarball, '-C', join(root, 'package'), 'package'])
  const integrity = `sha512-${createHash('sha512')
    .update(await readFile(tarball))
    .digest('base64')}`

  await writeFile(
    join(repo, 'pnpm-lock.yaml'),
    `importers:

  .:
    devDependencies:
      vouchington-tooling:
        specifier: ^${lockedVersion}
        version: ${lockedVersion}(example-peer@0.0.0-test)

packages:

  vouchington-tooling@${lockedVersion}:
    resolution: {integrity: ${options.lockedIntegrity ?? integrity}}

snapshots:

  vouchington-tooling@${lockedVersion}(example-peer@0.0.0-test):
    dependencies: {}
`,
  )

  const bin = join(root, 'bin')
  await mkdir(bin)
  const { stdout: python } = await execFile('python3', ['-c', 'import sys; print(sys.executable)'])
  await symlink(python.trim(), join(bin, 'python3'))

  const run = (registry = join(root, 'registry')) =>
    execFile(join(bin, 'python3'), [join(repo, 'ci/allocate-browser-safe-ports.py'), '3'], {
      env: { PATH: bin, npm_config_registry: pathToFileURL(registry).href },
    })
  return { repo, run }
}

describe('allocate-browser-safe-ports.py', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  it('allocates the requested number of unique ports', async () => {
    const { stdout } = await execFile('python3', [scriptPath, '6'], {
      cwd: process.cwd(),
      env: { ...process.env, GITHUB_ACTIONS: '' },
    })
    const ports = parsePorts(stdout)

    expect(ports).toHaveLength(6)
    expect(new Set(ports).size).toBe(6)
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true)
      expect(port).toBeGreaterThan(0)
    }
  })

  it('runs the locked allocator from its registry tarball without node, pnpm, or an install', async () => {
    const { run } = await stubWorkspace()

    const { stdout } = await run()

    expect(JSON.parse(stdout)).toEqual({
      label: 'registry',
      args: ['3'],
      files: ['allocate-browser-safe-ports.py', ...allocatorFiles],
    })
  })

  it('refuses a tarball that does not match the lockfile integrity', async () => {
    const mismatch = `sha512-${createHash('sha512').update('other').digest('base64')}`
    const { run } = await stubWorkspace({ lockedIntegrity: mismatch })

    const failure = await run().then(
      () => undefined,
      (err: { code: number; stdout: string; stderr: string }) => err,
    )

    expect(failure?.code).not.toBe(0)
    expect(failure?.stderr).toContain('does not match the pnpm-lock.yaml integrity')
    expect(failure?.stdout).toBe('')
  })

  it('prefers the installed allocator and never contacts the registry', async () => {
    const { repo, run } = await stubWorkspace()
    const installed = join(repo, 'node_modules/vouchington-tooling/scripts')
    await mkdir(installed, { recursive: true })
    await writeFile(join(installed, 'allocate-browser-safe-ports.py'), stubAllocator('installed'))

    const { stdout } = await run(join(repo, 'missing-registry'))

    expect(JSON.parse(stdout)).toMatchObject({ label: 'installed', args: ['3'] })
  })
})
