import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { loadCurrentWorktreeEnv } from './tooling-test-env.mts'
import { workerRuntimeTestingInline } from '../test-helpers/vitest-config/aliases.mts'

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
  try {
    const workerSetupPath = join(dir, 'worker-setup.mts')
    await writeFile(
      workerSetupPath,
      `import { Worker, getOrCreateQueue } from ${JSON.stringify(runtimeTestingPath)}
new Worker(getOrCreateQueue('background'), async () => undefined)
`,
    )
    await writeFile(
      join(dir, 'vitest.config.mts'),
      `export default {
  resolve: { alias: [{ find: /^glide-mq$/, replacement: ${JSON.stringify(runtimeTestingPath)} }] },
  test: {
    server: { deps: { inline: ${JSON.stringify(workerRuntimeTestingInline)} } },
    pool: 'forks', maxForks: 1, minForks: 1, isolate: false,
    setupFiles: [${JSON.stringify(workerSetupPath)}${withForkLeakHook ? `, ${JSON.stringify(forkLeakSetupPath)}` : ''}],
    testTimeout: 5_000, hookTimeout: 5_000,
  },
}
`,
    )
    await writeFile(
      join(dir, 'post-reset.test.mts'),
      `import { afterAll, expect, it, vi } from 'vitest'
let completed = false
let worker
// The worker must finish between the two test checkpoints, not during setup.
afterAll(async () => { await worker?.close() })
it('starts work on the reloaded background queue', async () => {
  vi.resetModules()
  const { Worker, getOrCreateQueue } = await import(${JSON.stringify(runtimeTestingPath)})
  const queue = getOrCreateQueue('background')
  worker = new Worker(queue, async () => {
    await new Promise(resolve => setTimeout(resolve, 1_500))
    completed = true
  })
  await queue.enqueue('post-reset', {})
})
it('sees runnable work settled before the next test', () => {
  expect(completed).toBe(true)
})
`,
    )
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [vitestCliPath, 'run'], {
        cwd: dir,
        env: {
          ...loadCurrentWorktreeEnv(repoRoot, process.env),
          CI: '',
          VITEST_FORK_LEAK_DETECTION: 'on',
        },
        timeout: 25_000,
      })
      return { exitCode: 0, output: `${stdout}\n${stderr}` }
    } catch (err) {
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
      return {
        exitCode: failed.code,
        output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`,
      }
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
