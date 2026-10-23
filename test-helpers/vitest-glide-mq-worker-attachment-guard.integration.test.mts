import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { workerRuntimeTestingInline } from './vitest-config/aliases.mts'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const glideMqTestingPath = fileURLToPath(import.meta.resolve('glide-mq/testing'))
const workerRuntimeTestingPath = fileURLToPath(
  import.meta.resolve('@vouchington/worker-runtime/testing'),
)
const guardRunnerPath = join(repoRoot, 'test-helpers/vitest.runner.backend-data-guards.mts')
const testDirs: string[] = []

type FixtureFile = { name: string; source: string }

function normalizeVitestOutput(output: string): string {
  const ansiEscapeSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
  return output.replace(ansiEscapeSequence, '')
}

async function makeFixture(
  files: FixtureFile[],
  { resettableWorkerRuntime = false }: { resettableWorkerRuntime?: boolean } = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-glidemq-worker-attachment-guard-'))
  testDirs.push(dir)
  const baselineSetupPath = join(dir, 'baseline-setup.mts')
  await writeFile(
    baselineSetupPath,
    `import { TestWorker } from ${JSON.stringify(glideMqTestingPath)}
import { getOrCreateQueue } from ${JSON.stringify(workerRuntimeTestingPath)}
new TestWorker(getOrCreateQueue('intentional-worker'), () => undefined)
`,
  )
  await writeFile(
    join(dir, 'vitest.config.mts'),
    `export default {
  ${resettableWorkerRuntime ? `resolve: { alias: [{ find: /^glide-mq$/, replacement: ${JSON.stringify(workerRuntimeTestingPath)} }] },` : ''}
  test: {
    ${resettableWorkerRuntime ? `server: { deps: { inline: ${JSON.stringify(workerRuntimeTestingInline)} } },` : ''}
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
    runner: ${JSON.stringify(guardRunnerPath)},
    isolate: false,
    sequence: { hooks: 'stack' },
    setupFiles: [${JSON.stringify(baselineSetupPath)}],
  },
}
`,
  )
  await Promise.all(files.map(file => writeFile(join(dir, file.name), file.source)))
  return dir
}

async function runFixture(dir: string): Promise<{ exitCode: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [vitestCliPath, 'run'], {
      cwd: dir,
      env: { ...process.env, CI: '' },
      timeout: 25_000,
    })
    return { exitCode: 0, output: normalizeVitestOutput(`${stdout}\n${stderr}`) }
  } catch (err) {
    const executionError = err as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: executionError.code ?? 1,
      output: normalizeVitestOutput(
        `${executionError.stdout ?? ''}\n${executionError.stderr ?? ''}`,
      ),
    }
  }
}

describe('Vitest GlideMQ worker attachment guard', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('reloads the published worker adapter with app modules after vi.resetModules()', async () => {
    const dir = await makeFixture(
      [
        {
          name: 'reset.test.mts',
          source: `import { expect, it, vi } from 'vitest'
import { Queue, Worker } from 'glide-mq'

it('does not retain a previous app worker on a freshly loaded queue', async () => {
  const name = 'module-reset-' + crypto.randomUUID()
  const firstQueue = new Queue(name)
  const firstWorker = new Worker(name, async job => job.data)
  try {
    expect(await firstQueue.getWorkers()).toHaveLength(1)
    vi.resetModules()
    const { Queue: ReloadedQueue, Worker: ReloadedWorker } = await import('glide-mq')
    const secondQueue = new ReloadedQueue(name)
    const secondWorker = new ReloadedWorker(name, async job => job.data)
    try {
      expect(secondQueue).not.toBe(firstQueue)
      expect(await secondQueue.getWorkers()).toHaveLength(1)
      const job = await secondQueue.add('reset', { value: 1 })
      expect(await secondQueue.getJob(job.id)).toMatchObject({ returnvalue: { value: 1 } })
    } finally {
      await secondWorker.close()
    }
  } finally {
    await firstWorker.close()
  }
})
`,
        },
      ],
      { resettableWorkerRuntime: true },
    )

    const result = await runFixture(dir)

    expect(result.exitCode).toBe(0)
  })
})
