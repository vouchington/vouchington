import { execFile } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { runProcess } from '../test-helpers/run-process.mts'

const execFileAsync = promisify(execFile)
const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))
const devRoot = dirname(initializePath)

const testDirs: string[] = []

async function makeInitializeFixtureRepo() {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-main-'))
  testDirs.push(root)

  await mkdir(join(root, 'dev'), { recursive: true })
  await cp(initializePath, join(root, 'dev', 'initialize'))
  await writeFile(join(root, 'dev', 'host-storage-preflight.mts'), '')
  await cp(join(devRoot, 'lib'), join(root, 'dev', 'lib'), { recursive: true })
  await execFileAsync('git', ['init'], { cwd: root })

  return root
}

async function makePathBin(commands: string[]) {
  const bin = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-bin-'))
  testDirs.push(bin)

  for (const command of commands) {
    if (command === 'df') {
      await writeFile(
        join(bin, 'df'),
        '#!/bin/bash\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted on\\nfixture 20000000 0 10000000 0%% /\\n"\n',
      )
      await chmod(join(bin, 'df'), 0o755)
      continue
    }
    const commandPath = await execFileAsync('bash', ['-lc', `command -v ${command}`])
    await symlink(commandPath.stdout.trim(), join(bin, command))
  }

  return bin
}

async function writeCacheSentinels(root: string) {
  const wranglerState = join(root, 'cloudflare-worker', '.wrangler', 'state')
  const wranglerRuntime = join(root, 'cloudflare-worker', '.wrangler', 'runtime')
  const nextCache = join(root, 'web', '.next')

  await mkdir(wranglerState, { recursive: true })
  await writeFile(join(wranglerState, 'sentinel'), '1')
  await mkdir(wranglerRuntime, { recursive: true })
  await writeFile(join(wranglerRuntime, 'sentinel'), '1')
  await mkdir(nextCache, { recursive: true })
  await writeFile(join(nextCache, 'sentinel'), '1')

  return {
    nextSentinel: join(nextCache, 'sentinel'),
    wranglerRuntimeSentinel: join(wranglerRuntime, 'sentinel'),
    wranglerStateSentinel: join(wranglerState, 'sentinel'),
  }
}

async function makeIsolatedTmp() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-isolated-tmp-'))
  testDirs.push(dir)
  return dir
}

async function runFixtureInitializeWeb({ path, root }: { path: string; root: string }) {
  // Fixtures live under os.tmpdir(); pin process temp away from that prefix so
  // initialize still classifies this checkout as main (the suite subject).
  const isolatedTmp = await makeIsolatedTmp()
  await writeFile(
    join(path, 'pnpm'),
    `#!/bin/bash
/bin/mkdir -p "$PWD/node_modules/vouchington-tooling/scripts/worktree"
/bin/cp "$WORKTREE_SCRIPT_SOURCE" "$PWD/node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh"
printf 'ran\\n' > "$PWD/pnpm-ran"
`,
  )
  await chmod(join(path, 'pnpm'), 0o755)

  const result = await runProcess('/bin/bash', [join(root, 'dev', 'initialize'), 'web'], {
    cwd: root,
    env: {
      ...process.env,
      HOME: root,
      PATH: path,
      SKIP_NVM_INSTALL: '1',
      WORKTREE_SCRIPT_SOURCE: join(
        devRoot,
        '../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
      ),
      TEMP: isolatedTmp,
      TMP: isolatedTmp,
      TMPDIR: isolatedTmp,
    },
  })

  return { ...result, stderr: result.stderr.trim(), stdout: result.stdout.trim() }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function expectCacheSentinelsToExist(
  sentinels: Awaited<ReturnType<typeof writeCacheSentinels>>,
  exists: boolean,
) {
  expect(await fileExists(sentinels.wranglerStateSentinel)).toBe(exists)
  expect(await fileExists(sentinels.wranglerRuntimeSentinel)).toBe(exists)
  expect(await fileExists(sentinels.nextSentinel)).toBe(exists)
}

describe('initialize main web cache cleanup ordering', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('preserves Wrangler and Next.js caches until Docker checks pass', async () => {
    const scenarios = [
      { expected: 'Docker is not installed' },
      {
        docker: '#!/bin/bash\n[ "$*" = info ] && exit 1\nexit 0\n',
        expected: 'Docker daemon is not reachable',
      },
    ]

    for (const scenario of scenarios) {
      const root = await makeInitializeFixtureRepo()
      const sentinels = await writeCacheSentinels(root)
      const bin = await makePathBin(['awk', 'basename', 'df', 'dirname', 'git', 'node'])
      if (scenario.docker) {
        await writeFile(join(bin, 'docker'), scenario.docker)
        await chmod(join(bin, 'docker'), 0o755)
      }

      const result = await runFixtureInitializeWeb({ path: bin, root })

      expect(result.code).toBe(1)
      expect(result.stdout).toContain(scenario.expected)
      await expectCacheSentinelsToExist(sentinels, true)
    }
  })

  it('blocks before Docker and cache cleanup when host storage validation fails', async () => {
    const root = await makeInitializeFixtureRepo()
    const sentinels = await writeCacheSentinels(root)
    const dockerMarker = join(root, 'docker-was-called')
    const bin = await makePathBin(['awk', 'basename', 'df', 'dirname', 'git', 'node'])
    await writeFile(
      join(root, 'dev', 'host-storage-preflight.mts'),
      `console.error('Error: synthetic host storage failure')
process.exitCode = 1
`,
    )
    await writeFile(
      join(bin, 'docker'),
      `#!/bin/bash
touch '${dockerMarker}'
exit 0
`,
    )
    await chmod(join(bin, 'docker'), 0o755)

    const result = await runFixtureInitializeWeb({ path: bin, root })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('synthetic host storage failure')
    expect(await fileExists(dockerMarker)).toBe(false)
    await expectCacheSentinelsToExist(sentinels, true)
  })

  it('rejects ambiguous database selectors before cache cleanup', async () => {
    const root = await makeInitializeFixtureRepo()
    const sentinels = await writeCacheSentinels(root)
    const dockerMutationMarker = join(root, 'docker-mutated')
    const pnpmMarker = join(root, 'pnpm-ran')
    const bin = await makePathBin(['awk', 'basename', 'df', 'dirname', 'git', 'node', 'tr'])
    await writeFile(join(root, 'voucha.env'), 'export PGHOST=dbhost\n')
    await writeFile(
      join(bin, 'docker'),
      `#!/bin/bash
if [ "$*" != info ]; then printf 'mutated\n' > '${dockerMutationMarker}'; fi
exit 0
`,
    )
    await chmod(join(bin, 'docker'), 0o755)

    const result = await runFixtureInitializeWeb({ path: bin, root })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('PGHOST cannot select the Voucha worktree database')
    expect(result.stdout).not.toContain('Clearing stale dev caches')
    await expectCacheSentinelsToExist(sentinels, true)
    expect(await fileExists(dockerMutationMarker)).toBe(false)
    expect(await fileExists(pnpmMarker)).toBe(true)
    expect(await fileExists(join(root, '.env'))).toBe(false)
    expect(await fileExists(join(root, '.valkey-port'))).toBe(false)
  })

  it('clears Wrangler and Next.js caches after Docker prerequisites pass', async () => {
    const root = await makeInitializeFixtureRepo()
    const sentinels = await writeCacheSentinels(root)
    const bin = await makePathBin([
      'basename',
      'awk',
      'df',
      'dirname',
      'git',
      'grep',
      'head',
      'node',
      'rm',
      'tr',
    ])
    await writeFile(
      join(bin, 'docker'),
      `#!/bin/bash
case "$*" in
  info)
    exit 0
    ;;
  "ps -a --format {{.Names}}" | "ps -a --filter publish="*" --format {{.Names}}")
    exit 0
    ;;
  run\\ -d\\ --name*)
    exit 1
    ;;
  *)
    exit 1
    ;;
esac
`,
    )
    await chmod(join(bin, 'docker'), 0o755)

    const result = await runFixtureInitializeWeb({ path: bin, root })

    expect(result.code).not.toBe(0)
    expect(result.stdout).toContain('Clearing stale dev caches')
    await expectCacheSentinelsToExist(sentinels, false)
  })
})
