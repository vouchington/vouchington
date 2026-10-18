import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { workerRuntimeTestingInline } from './vitest-config/aliases.mts'
import { formatForkLeakDiagnostics } from './vitest-fork-leak-diagnostics.mts'
import { getForkLeakDetector } from './vitest-fork-leak-detection.mts'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const runtimeTestingPath = fileURLToPath(import.meta.resolve('@vouchington/worker-runtime/testing'))
const forkLeakSetupPath = join(repoRoot, 'test-helpers/vitest.setup.fork-leak-detection.mts')

async function runPostResetWorkFixture(withForkLeakHook: boolean): Promise<{
  exitCode: number
  output: string
}> {
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
        env: { ...process.env, CI: '', VITEST_FORK_LEAK_DETECTION: 'on' },
        timeout: 25_000,
      })
      return { exitCode: 0, output: `${stdout}\n${stderr}` }
    } catch (err) {
      const failed = err as { code?: number; stdout?: string; stderr?: string }
      return {
        exitCode: failed.code ?? 1,
        output: `${failed.stdout ?? ''}\n${failed.stderr ?? ''}`,
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('getForkLeakDetector', () => {
  it('returns the same detector instance on repeated calls within a process', () => {
    const first = getForkLeakDetector()
    const second = getForkLeakDetector()

    expect(second).toBe(first)
  })
})

describe('formatForkLeakDiagnostics', () => {
  it('renders the verdict, tracked counts, and unavailable PostgreSQL pool context', () => {
    const counts = new Map<string, number>([
      ['PipeWrap', 8],
      ['TCPSocketWrap', 14],
      ['Timeout', 1],
    ])

    expect(
      formatForkLeakDiagnostics(
        {
          type: 'TCPSocketWrap',
          baseline: 5,
          current: 14,
          streak: 5,
          growthCheckpoints: 4,
          requiredGrowthCheckpoints: 4,
          detectedInFile: 'bystander.test.mts',
          suspectedGrowth: {
            testFile: 'source.test.mts',
            previous: 8,
            current: 14,
            delta: 6,
          },
        },
        counts,
      ),
    ).toBe(
      [
        '[vitest-fork-leak]',
        'type: TCPSocketWrap',
        'baseline: 5',
        'current: 14 (+9)',
        'candidate evidence span: 5',
        'candidate growth evidence: 4 (required: 4)',
        'confirmed by continuation in file: bystander.test.mts',
        'suspected growth file: source.test.mts',
        'largest growth step: 8 -> 14 (+6)',
        'tracked resource counts: PipeWrap=8 TCPSocketWrap=14 Timeout=1',
        'PostgreSQL pool metrics: unavailable (pools not initialized)',
      ].join('\n'),
    )
  })
})

describe('fork leak setup after module reset', () => {
  it('would miss current-generation work without the setup hook', async () => {
    const withoutHook = await runPostResetWorkFixture(false)
    expect(withoutHook.exitCode).not.toBe(0)
    expect(withoutHook.output).toContain('sees runnable work settled before the next test')
    expect(withoutHook.output).toContain('expected false to be true')
  })

  it('waits for current-generation runnable work before the next checkpoint', async () => {
    const withHook = await runPostResetWorkFixture(true)
    expect(withHook.exitCode).toBe(0)
    expect(withHook.output).toContain('2 passed')
  })
})
