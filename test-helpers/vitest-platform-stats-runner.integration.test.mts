import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const runnerPath = fileURLToPath(
  new URL('./vitest.runner.platform-stats-cache.mts', import.meta.url),
)
const vitestPackage = dirname(fileURLToPath(import.meta.resolve('vitest/package.json')))
const directories: string[] = []

type Failure = 'test' | 'collection' | 'cleanup' | 'test-and-cleanup'

async function runFixture(failure?: Failure) {
  const directory = await mkdtemp(join(tmpdir(), 'voucha-platform-stats-runner-'))
  directories.push(directory)
  const receipt = join(directory, 'receipt')
  const docker = join(directory, 'docker')
  const observer = join(directory, 'runner.mts')
  await writeFile(
    docker,
    `#!${process.execPath}
const { appendFileSync, readFileSync, writeFileSync } = require('node:fs')
const args = process.argv.slice(2)
const id = 'a'.repeat(64)
const receipt = process.env.CACHE_RECEIPT
if (args[0] === 'create') {
  writeFileSync(receipt + '.owner', args[args.indexOf('--label') + 1].split('=')[1])
  appendFileSync(receipt, 'create\\n')
  console.log(id)
} else if (args[0] === 'events') {
  console.log(JSON.stringify({ Actor: { ID: id }, Action: 'health_status: healthy' }))
} else if (args[0] === 'inspect') {
  console.log(args[2].includes('NetworkSettings')
    ? JSON.stringify({ '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '43210' }] })
    : (appendFileSync(receipt, 'inspect-owner\\n'), readFileSync(receipt + '.owner', 'utf8')))
} else if (args[0] === 'rm') {
  appendFileSync(receipt, 'remove\\n')
  if (['cleanup', 'test-and-cleanup'].includes(process.env.CACHE_FAILURE)) {
    console.error('owned container removal failed')
    process.exitCode = 1
  }
}
`,
    { mode: 0o755 },
  )
  await writeFile(
    observer,
    `import Runner from ${JSON.stringify(runnerPath)}
import { appendFileSync } from 'node:fs'
export default class ObservedRunner extends Runner {
  constructor(config) {
    super(config)
    this.onCleanupWorkerContext(() => appendFileSync(process.env.CACHE_RECEIPT,
      'restored:' + JSON.stringify([
        process.env.VALKEY_CACHE_URL,
        process.env.VALKEY_RATE_LIMITER_URL,
        process.env.VALKEY_BLOOM_URL,
      ]) + '\\n'))
  }
}
`,
  )
  await writeFile(
    join(directory, 'vitest.config.mjs'),
    `export default { test: { pool: 'forks', runner: ${JSON.stringify(observer)}, testTimeout: 5000, hookTimeout: 5000 } }`,
  )
  await writeFile(
    join(directory, 'cache.test.mjs'),
    `import { afterAll, expect, it } from ${JSON.stringify(join(vitestPackage, 'dist/index.js'))}
import { appendFileSync } from 'node:fs'
if (process.env.VALKEY_CACHE_URL !== 'redis://127.0.0.1:43210') throw new Error('cache imported before private endpoint')
if (process.env.VALKEY_RATE_LIMITER_URL !== 'redis://shared-cache:6379') throw new Error('rate limiter moved to private cache')
if (process.env.VALKEY_BLOOM_URL !== 'redis://shared-cache:6379') throw new Error('bloom moved to private cache')
${failure === 'collection' ? "throw new Error('owned collection failure')" : ''}
afterAll(() => appendFileSync(process.env.CACHE_RECEIPT, 'file-hook\\n'))
it('owns its private cache', () => { ${failure === 'test' || failure === 'test-and-cleanup' ? "throw new Error('owned test failure')" : 'expect(true).toBe(true)'} })
`,
  )
  let exitCode = 0
  let output = ''
  try {
    const result = await execFileAsync(
      process.execPath,
      [join(vitestPackage, 'vitest.mjs'), 'run'],
      {
        cwd: directory,
        timeout: 5_000,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          VALKEY_CACHE_URL: 'redis://shared-cache:6379',
          VALKEY_RATE_LIMITER_URL: undefined,
          VALKEY_BLOOM_URL: undefined,
          CACHE_RECEIPT: receipt,
          CACHE_FAILURE: failure,
        },
      },
    )
    output = `${result.stdout}\n${result.stderr}`
  } catch (err) {
    const result = err as { code?: number; stdout?: string; stderr?: string }
    exitCode = result.code ?? 1
    output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  }
  return { exitCode, output, events: (await readFile(receipt, 'utf8')).trim().split('\n') }
}

describe('platform-stats worker cache ownership', () => {
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
  })

  it.each([undefined, 'test', 'collection', 'cleanup', 'test-and-cleanup'] as const)(
    'finalizes the selected worker after %s',
    async failure => {
      const result = await runFixture(failure)
      expect(result.exitCode === 0).toBe(failure === undefined)
      expect(result.events.filter(event => event === 'create')).toHaveLength(1)
      expect(result.events.filter(event => event === 'remove')).toHaveLength(1)
      expect(result.events.filter(event => event === 'inspect-owner')).toHaveLength(1)
      expect(result.events.at(-1)).toBe('restored:["redis://shared-cache:6379",null,null]')
      expect(result.events.filter(event => event === 'file-hook')).toHaveLength(
        failure === 'collection' ? 0 : 1,
      )
      expect(result.events.indexOf('file-hook')).toBeLessThan(result.events.indexOf('remove'))
      expect(result.output.includes('owned collection failure')).toBe(failure === 'collection')
      expect(result.output.includes('owned container removal failed')).toBe(
        failure === 'cleanup' || failure === 'test-and-cleanup',
      )
      expect(result.output.includes('owned test failure')).toBe(
        failure === 'test' || failure === 'test-and-cleanup',
      )
    },
  )
})
