import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const vitestCliPath = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const glideMqTestingPath = fileURLToPath(import.meta.resolve('glide-mq/testing'))
const internalsPath = join(repoRoot, 'test-helpers/glide-mq-vitest-internals.mts')
const guardRunnerPath = join(
  repoRoot,
  'test-helpers/vitest.runner.glide-mq-worker-attachment-guard.mts',
)
const testDirs: string[] = []

type FixtureFile = { name: string; source: string }

function normalizeVitestOutput(output: string): string {
  const ansiEscapeSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g')
  return output.replace(ansiEscapeSequence, '')
}

function firstLeakDiagnostic(output: string): string {
  const tag = '[vitest-glide-mq-worker-attachment-leak]'
  const remediation =
    'This guard intentionally does not close workers, so the leak remains visible at its source.'
  const start = output.indexOf(tag)
  const end = output.indexOf(remediation, start)
  if (start < 0 || end < 0) return ''
  return output.slice(start, end + remediation.length)
}

async function makeFixture(files: FixtureFile[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-glidemq-worker-attachment-guard-'))
  testDirs.push(dir)
  const baselineSetupPath = join(dir, 'baseline-setup.mts')
  await writeFile(
    baselineSetupPath,
    `import { TestWorker } from ${JSON.stringify(glideMqTestingPath)}
import { getOrCreateQueue } from ${JSON.stringify(internalsPath)}
new TestWorker(getOrCreateQueue('intentional-worker'), () => undefined)
`,
  )
  await writeFile(
    join(dir, 'vitest.config.mts'),
    `export default {
  test: {
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
  } catch (error) {
    const executionError = error as { code?: number; stdout?: string; stderr?: string }
    return {
      exitCode: executionError.code ?? 1,
      output: normalizeVitestOutput(
        `${executionError.stdout ?? ''}\n${executionError.stderr ?? ''}`,
      ),
    }
  }
}

function fixtureTestSource(
  queueNames: string[],
  closeInAfterAll = false,
  createAtTopLevel = false,
): string {
  return `import { afterAll, beforeAll, it } from 'vitest'
import { TestWorker } from ${JSON.stringify(glideMqTestingPath)}
import { getOrCreateQueue } from ${JSON.stringify(internalsPath)}
const workers = []
${
  createAtTopLevel
    ? `workers.push(...${JSON.stringify(queueNames)}.map(queueName => new TestWorker(getOrCreateQueue(queueName), () => undefined)))`
    : `beforeAll(() => {
  workers.push(...${JSON.stringify(queueNames)}.map(queueName => new TestWorker(getOrCreateQueue(queueName), () => undefined)))
})`
}
${closeInAfterAll ? 'afterAll(async () => { await Promise.all(workers.map(worker => worker.close())) })' : ''}
it('runs fixture assertion', () => {})
`
}

describe('Vitest GlideMQ worker attachment guard', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('allows intentional baseline workers and a worker closed by the file afterAll', async () => {
    const dir = await makeFixture([
      { name: 'baseline.test.mts', source: fixtureTestSource([]) },
      { name: 'closed.test.mts', source: fixtureTestSource(['closed-worker'], true) },
    ])

    const result = await runFixture(dir)

    expect(result.exitCode).toBe(0)
    expect(result.output).not.toContain('[vitest-glide-mq-worker-attachment-leak]')
  })

  it('fails a module-top-level worker leak with the tagged remediation diagnostic', async () => {
    const dir = await makeFixture([
      { name: 'leak.test.mts', source: fixtureTestSource(['one-leaked-worker'], false, true) },
    ])

    const result = await runFixture(dir)

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('[vitest-glide-mq-worker-attachment-leak]')
    expect(result.output).toContain('- one-leaked-worker')
    expect(result.output).toContain('await worker.close()')
  })

  it('reports a module-top-level worker when collection later throws', async () => {
    const dir = await makeFixture([
      {
        name: 'collection-failure.test.mts',
        source: `${fixtureTestSource(['collection-failure-worker'], false, true)}
throw new Error('collection exploded')
`,
      },
    ])

    const result = await runFixture(dir)

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('collection exploded')
    expect(result.output).toContain('[vitest-glide-mq-worker-attachment-leak]')
    expect(result.output).toContain('- collection-failure-worker')
  })

  it('reports multiple leaked queue names in lexical order without duplicates', async () => {
    const dir = await makeFixture([
      {
        name: 'multiple-leaks.test.mts',
        source: fixtureTestSource(['zeta-worker', 'alpha-worker', 'alpha-worker']),
      },
    ])

    const result = await runFixture(dir)
    const diagnostic = firstLeakDiagnostic(result.output)
    const alphaIndex = diagnostic.indexOf('- alpha-worker')
    const zetaIndex = diagnostic.indexOf('- zeta-worker')

    expect(result.exitCode).not.toBe(0)
    expect(alphaIndex).toBeGreaterThan(-1)
    expect(zetaIndex).toBeGreaterThan(alphaIndex)
    expect(diagnostic.match(/- alpha-worker/g)).toHaveLength(1)
  })

  it('fails the leaking file without preventing another isolate:false file from running', async () => {
    const dir = await makeFixture([
      { name: 'first-leak.test.mts', source: fixtureTestSource(['boundary-leak']) },
      {
        name: 'second-observer.test.mts',
        source: fixtureTestSource([]),
      },
    ])

    const result = await runFixture(dir)

    expect(result.exitCode).not.toBe(0)
    expect(result.output).toContain('[vitest-glide-mq-worker-attachment-leak]')
    expect(result.output).toContain('first-leak.test.mts')
    expect(result.output).toMatch(/Test Files\s+1 failed \| 1 passed \(2\)/)
  })
})
