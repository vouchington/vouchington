import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { loadCurrentWorktreeEnv } from './tooling-test-env.mts'
import { workerRuntimeTestingInline } from '../test-helpers/vitest-config/aliases.mts'
import { waitForFileMarker } from '../test-helpers/vitest-file-marker.mts'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const runtimeTestingPath = fileURLToPath(import.meta.resolve('@vouchington/worker-runtime/testing'))
const forkLeakSetupPath = join(repoRoot, 'test-helpers/vitest.setup.fork-leak-detection.mts')

type FixtureResult = { exitCode: number; output: string }

async function runPostResetWorkFixture(withForkLeakHook: boolean): Promise<FixtureResult> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-fork-leak-post-reset-'))
  const releasePath = join(dir, 'release-worker')
  const settlingPath = join(dir, 'current-queue-settling')
  const checkpointPath = join(dir, 'next-test-checkpoint')
  let childResult: Promise<FixtureResult> | undefined
  try {
    const workerSetupPath = join(dir, 'worker-setup.mts')
    const workerRuntimeWrapperPath = join(dir, 'worker-runtime-wrapper.mts')
    const fixtureWrites = [
      writeFile(
        workerRuntimeWrapperPath,
        `import { writeFile } from 'node:fs/promises'
import * as runtime from ${JSON.stringify(runtimeTestingPath)}
const targetQueueKey = Symbol.for('voucha-fork-leak-target-queue')
export const getOrCreateQueue = runtime.getOrCreateQueue
export async function settleRunnableQueueJobs(queue, ...args) {
  if ((globalThis as Record<PropertyKey, unknown>)[targetQueueKey] === queue) {
    await writeFile(${JSON.stringify(settlingPath)}, 'settling')
  }
  return runtime.settleRunnableQueueJobs(queue, ...args)
}
`,
      ),
      writeFile(
        workerSetupPath,
        `import { Worker, getOrCreateQueue } from ${JSON.stringify(runtimeTestingPath)}
new Worker(getOrCreateQueue('background'), async () => undefined)
`,
      ),
      writeFile(
        join(dir, 'vitest.config.mts'),
        `export default {
  resolve: { alias: [
    { find: /^@vouchington\\/worker-runtime\\/testing$/, replacement: ${JSON.stringify(workerRuntimeWrapperPath)} },
    { find: /^glide-mq$/, replacement: ${JSON.stringify(runtimeTestingPath)} },
  ] },
  test: {
    server: { deps: { inline: ${JSON.stringify(workerRuntimeTestingInline)} } },
    pool: 'forks', maxForks: 1, minForks: 1, isolate: false,
    setupFiles: [${JSON.stringify(workerSetupPath)}${withForkLeakHook ? `, ${JSON.stringify(forkLeakSetupPath)}` : ''}],
    testTimeout: 5_000, hookTimeout: 5_000,
  },
}
`,
      ),
      writeFile(
        join(dir, 'post-reset.test.mts'),
        `import { watch } from 'node:fs'
import { access, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
let completed = false
let worker
let startWorker
const workerStarted = new Promise(resolve => { startWorker = resolve })
const targetQueueKey = Symbol.for('voucha-fork-leak-target-queue')
function waitForRelease(path) {
  return new Promise((resolve, reject) => {
    const watcher = watch(dirname(path), (_event, filename) => {
      if (!filename || filename.toString() === basename(path)) void check()
    })
    const check = () => void access(path).then(() => { watcher.close(); resolve() }, error => {
      if (error.code !== 'ENOENT') { watcher.close(); reject(error) }
    })
    watcher.on('error', reject)
    check()
  })
}
afterAll(async () => { await worker?.close() })
it('starts work on the reloaded background queue', async () => {
  vi.resetModules()
  const { Worker, getOrCreateQueue } = await import(${JSON.stringify(runtimeTestingPath)})
  const queue = getOrCreateQueue('background')
  globalThis[targetQueueKey] = queue
  worker = new Worker(queue, async () => {
    startWorker()
    await waitForRelease(${JSON.stringify(releasePath)})
    completed = true
  })
  await queue.enqueue('post-reset', {})
  await workerStarted
})
it('sees runnable work settled before the next test', async () => {
  try { expect(completed).toBe(true) }
  finally { await writeFile(${JSON.stringify(checkpointPath)}, 'checked') }
})
`,
      ),
    ]
    await Promise.all(fixtureWrites)
    const markerWaiter = waitForFileMarker(
      dir,
      [settlingPath, checkpointPath].map(path => basename(path)),
    )
    try {
      childResult = execFileAsync(process.execPath, [vitestCliPath, 'run'], {
        cwd: dir,
        env: {
          ...loadCurrentWorktreeEnv(repoRoot, process.env),
          CI: '',
          VITEST_FORK_LEAK_DETECTION: 'on',
        },
        timeout: 25_000,
      }).then(
        ({ stdout, stderr }) => ({ exitCode: 0, output: `${stdout}\n${stderr}` }),
        err => {
          const failed = err as { code?: number; stdout?: string; stderr?: string }
          if (
            typeof failed.code !== 'number' ||
            (err as { killed?: boolean }).killed ||
            (err as { signal?: NodeJS.Signals | null }).signal
          ) {
            const output = `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`
            throw new Error(`Nested Vitest did not exit normally:\n${output.slice(-4_000)}`, {
              cause: err,
            })
          }
          return { exitCode: failed.code, output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}` }
        },
      )
      const first = await Promise.race([
        markerWaiter.promise.then(marker => ({ marker })),
        childResult.then(result => ({ result })),
      ])
      if ('result' in first) return first.result
      await writeFile(releasePath, 'release')
      return await childResult
    } finally {
      markerWaiter.close()
      await writeFile(releasePath, 'release').catch(() => undefined)
      await childResult?.catch(() => undefined)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export async function runForkLeakPreflight(): Promise<void> {
  const withoutHook = await runPostResetWorkFixture(false)
  if (
    withoutHook.exitCode !== 1 ||
    !withoutHook.output.includes('sees runnable work settled before the next test') ||
    !withoutHook.output.includes('expected false to be true')
  ) {
    throw new Error(
      `Fork-leak negative control did not fail at the completion assertion:\n${withoutHook.output}`,
    )
  }
  process.stderr.write('[tooling-preflight] post-reset negative control confirmed\n')

  const withHook = await runPostResetWorkFixture(true)
  if (withHook.exitCode !== 0 || !withHook.output.includes('2 passed')) {
    throw new Error(`Fork-leak setup did not settle post-reset runnable work:\n${withHook.output}`)
  }
  process.stderr.write('[tooling-preflight] post-reset work settled before the next test\n')
}
