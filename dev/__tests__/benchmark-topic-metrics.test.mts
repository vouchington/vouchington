import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createBenchmarkCleanup,
  createFreshBenchmarkDatabase,
  type BenchmarkDatabase,
  type CommandRunner,
} from '../../backend/scripts/explain-analyze/benchmarks/topic-metrics/database-lifecycle.mts'

const exec = promisify(execFile)
const scriptPath = fileURLToPath(new URL('../benchmark-topic-metrics', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const dbTargetPath = fileURLToPath(new URL('../lib/db-target.sh', import.meta.url))
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const temporaryDirectories: string[] = []

describe('benchmark-topic-metrics CLI', () => {
  registerTemporaryDirectoryCleanup()

  it('keeps help and invalid arguments side-effect-free', async () => {
    const root = await makeRepository()
    const bin = await makeFakeBin()

    const help = await runCli(root, bin, ['--help'])
    expect(help.stdout).toContain('--label baseline|candidate')
    await expect(readFile(join(root, 'commands.log'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })

    await expect(runCli(root, bin, ['--label', 'invalid'])).rejects.toMatchObject({ code: 2 })
    await expect(readFile(join(root, 'commands.log'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('refuses a remote database even when the cleanup opt-in is set', async () => {
    const root = await makeRepository()
    const bin = await makeFakeBin()

    await expect(
      runCli(root, bin, ['--label', 'candidate'], {
        DATABASE_URL: 'postgres://db.example.com/voucha-production',
        VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
      }),
    ).rejects.toMatchObject({ code: 1 })
    await expect(readFile(join(root, 'commands.log'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('passes a unique sibling database name to the benchmark runner', async () => {
    const root = await makeRepository()
    const bin = await makeFakeBin()

    await runCli(root, bin, ['--label', 'baseline'], {
      DATABASE_URL: 'postgres://localhost:5432/voucha-d123456789abc',
    })

    expect(await readFile(join(root, 'commands.log'), 'utf8')).toContain(
      'db=voucha-d123456789abc_topic_metrics_baseline source=voucha-d123456789abc label=baseline',
    )
  })
})

describe('topic metrics benchmark database lifecycle', () => {
  registerTemporaryDirectoryCleanup()

  it('shares cleanup across signals after the database has been created', async () => {
    let database: { drop: () => Promise<void> } | undefined
    const closePools = vi.fn<() => Promise<void>>(async () => {})
    const drop = vi.fn<() => Promise<void>>(async () => {})
    const cleanup = createBenchmarkCleanup({
      closePools,
      getDatabase: () => database,
    })

    database = { drop }
    await Promise.all([cleanup(), cleanup()])

    expect(closePools).toHaveBeenCalledOnce()
    expect(drop).toHaveBeenCalledOnce()
  })

  it('drops the benchmark database when closing pools fails', async () => {
    const drop = vi.fn<() => Promise<void>>(async () => {})
    const cleanup = createBenchmarkCleanup({
      closePools: async () => {
        throw new Error('pool close failed')
      },
      getDatabase: () => ({ drop }),
    })

    await expect(cleanup()).rejects.toThrow('pool close failed')
    expect(drop).toHaveBeenCalledOnce()
  })

  it('drops exactly the database it created and only once', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const run: CommandRunner = async (file, args) => {
      calls.push({ file, args })
      return { stdout: '' }
    }

    const database = await createFreshBenchmarkDatabase(
      run,
      'postgres://localhost/voucha-d123456789abc',
      'voucha-d123456789abc_topic_metrics_candidate',
    )
    await database.drop()
    await database.drop()

    expect(calls).toEqual([
      {
        file: 'psql',
        args: [
          '-d',
          'postgres://localhost/voucha-d123456789abc',
          '-Atqc',
          "SELECT 1 FROM pg_database WHERE datname = 'voucha-d123456789abc_topic_metrics_candidate'",
        ],
      },
      {
        file: 'createdb',
        args: ['--', 'voucha-d123456789abc_topic_metrics_candidate'],
      },
      {
        file: 'dropdb',
        args: ['--if-exists', '--', 'voucha-d123456789abc_topic_metrics_candidate'],
      },
    ])
  })

  it('registers the drop handle before creation resolves', async () => {
    const events: string[] = []
    const run: CommandRunner = async file => {
      events.push(file)
      return { stdout: '' }
    }
    let resolved = false

    await createFreshBenchmarkDatabase(
      run,
      'postgres://localhost/voucha-d123456789abc',
      'voucha-d123456789abc_topic_metrics_candidate',
      () => {
        expect(resolved).toBe(false)
        events.push('registered')
      },
    ).then(() => {
      resolved = true
      events.push('resolved')
    })

    expect(events).toEqual(['psql', 'createdb', 'registered', 'resolved'])
  })

  it('waits for in-flight database creation before signal cleanup drops it', async () => {
    let releaseCreatedb: (() => void) | undefined
    let reportCreatedbStarted: (() => void) | undefined
    const createdbBarrier = new Promise<void>(resolve => {
      releaseCreatedb = resolve
    })
    const createdbStarted = new Promise<void>(resolve => {
      reportCreatedbStarted = resolve
    })
    const drop = vi.fn<() => Promise<void>>(async () => {})
    let database: BenchmarkDatabase | undefined
    const creation = createFreshBenchmarkDatabase(
      async file => {
        if (file === 'createdb') {
          reportCreatedbStarted?.()
          await createdbBarrier
        }
        return { stdout: '' }
      },
      'postgres://localhost/voucha-d123456789abc',
      'voucha-d123456789abc_topic_metrics_candidate',
      created => {
        database = { drop }
        expect(created).toHaveProperty('drop')
      },
    )
    await createdbStarted
    const cleanup = createBenchmarkCleanup({
      closePools: async () => {},
      getDatabase: () => database,
      waitForDatabaseCreation: async () => {
        await creation
      },
    })

    const cleanupWhileCreating = cleanup()
    expect(drop).not.toHaveBeenCalled()
    releaseCreatedb?.()
    await Promise.all([creation, cleanupWhileCreating])

    expect(drop).toHaveBeenCalledOnce()
  })

  it('never creates or drops a database that already exists', async () => {
    const calls: string[] = []
    const run: CommandRunner = async file => {
      calls.push(file)
      return { stdout: '1\n' }
    }

    await expect(
      createFreshBenchmarkDatabase(
        run,
        'postgres://localhost/voucha-d123456789abc',
        'voucha-d123456789abc_topic_metrics_baseline',
      ),
    ).rejects.toThrow('refusing existing benchmark database')
    expect(calls).toEqual(['psql'])
  })
})

function registerTemporaryDirectoryCleanup(): void {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(directory => rm(directory, { recursive: true, force: true })),
    )
  })
}

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'voucha-topic-metrics-benchmark-'))
  temporaryDirectories.push(root)
  await mkdir(join(root, 'dev', 'lib'), { recursive: true })
  await Promise.all([
    copyExecutable(scriptPath, join(root, 'dev', 'benchmark-topic-metrics')),
    copyFile(refuseOnMainPath, join(root, 'dev', 'lib', 'refuse-on-main.sh')),
    copyFile(dbTargetPath, join(root, 'dev', 'lib', 'db-target.sh')),
    copyFile(dbNameFromUrlPath, join(root, 'dev', 'lib', 'db-name-from-url.sh')),
    writeFile(join(root, '.git'), 'gitdir: /fake/.git/worktrees/benchmark\n'),
  ])
  return root
}

async function makeFakeBin(): Promise<string> {
  const bin = await mkdtemp(join(tmpdir(), 'voucha-topic-metrics-benchmark-bin-'))
  temporaryDirectories.push(bin)
  await Promise.all([
    writeExecutable(
      join(bin, 'git'),
      `#!/usr/bin/env bash
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
  printf '%s' "$2"
  exit 0
fi
exit 1
`,
    ),
    writeExecutable(
      join(bin, 'node'),
      `#!/usr/bin/env bash
printf 'db=%s source=%s label=%s args=%s\n' "$BENCHMARK_TOPIC_METRICS_DB" "$BENCHMARK_TOPIC_METRICS_SOURCE_DB" "$BENCHMARK_TOPIC_METRICS_LABEL" "$*" >> "$FAKE_COMMAND_LOG"
`,
    ),
  ])
  return bin
}

async function runCli(
  root: string,
  bin: string,
  args: string[],
  environment: Record<string, string> = {},
) {
  return exec('bash', [join(root, 'dev', 'benchmark-topic-metrics'), ...args], {
    cwd: root,
    env: {
      ...process.env,
      ...environment,
      FAKE_COMMAND_LOG: join(root, 'commands.log'),
      PATH: `${bin}:/usr/bin:/bin`,
    },
  })
}

async function copyFile(source: string, destination: string): Promise<void> {
  await writeFile(destination, await readFile(source))
}

async function copyExecutable(source: string, destination: string): Promise<void> {
  await copyFile(source, destination)
  await chmod(destination, 0o755)
}

async function writeExecutable(path: string, content: string): Promise<void> {
  await writeFile(path, content)
  await chmod(path, 0o755)
}
