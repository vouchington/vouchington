import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const guardPath = fileURLToPath(
  new URL('../../playwright/config/test-timeout.mts', import.meta.url),
)
const modules = fileURLToPath(new URL('../../node_modules', import.meta.url))
const cli = fileURLToPath(new URL('../../node_modules/@playwright/test/cli.js', import.meta.url))
export async function runFixture(
  body: string,
  options: {
    collection?: string
    cliTimeout?: string
    extended?: boolean
    workerFixture?: boolean
  } = {},
) {
  const dir = await mkdtemp(join(tmpdir(), 'playwright-public-cap-'))
  try {
    await symlink(modules, join(dir, 'node_modules'), 'dir')
    await writeFile(
      join(dir, 'setup.mts'),
      `export { assertResolvedPlaywrightTimeouts as default } from ${JSON.stringify(guardPath)}`,
    )
    await writeFile(
      join(dir, 'playwright.config.mts'),
      `export default { testDir: '.', testMatch: '**/*.spec.mts', globalSetup: './setup.mts', timeout: 30000, workers: 1, retries: 0, reporter: 'json' }`,
    )
    const specSource = `
      import { test as raw } from '@playwright/test'
      import { writeFileSync } from 'node:fs'
      import { guardPlaywrightTestTimeouts, protectPlaywrightHookTimeouts } from ${JSON.stringify(guardPath)}
      const guarded = guardPlaywrightTestTimeouts(raw)
      const test = ${options.extended ? `guarded.extend({ sample: ${options.workerFixture ? "[async ({}, use) => await use('fixture'), { scope: 'worker' }]" : "async ({}, use) => await use('fixture')"} })` : 'guarded'}
      ${options.collection ?? ''}
      test('tiny public boundary', async (${options.extended ? '{ sample }' : '{}'}, info) => {
        ${body}
        writeFileSync(${JSON.stringify(join(dir, 'body.marker'))}, 'continued')
      })
    `
    await writeFile(join(dir, 'tiny.spec.mts'), specSource)
    const args = [cli, 'test', '--config', join(dir, 'playwright.config.mts')]
    if (options.cliTimeout !== undefined) args.push('--timeout', options.cliTimeout)
    let code = 0
    let output = ''
    let stats: { expected: number; unexpected: number } | undefined
    let errors: { message: string; location?: { file: string; line: number } }[] = []
    const capture = (stdout: string, stderr: string) => {
      output = stdout + stderr
      try {
        const report = JSON.parse(stdout) as {
          stats: typeof stats
          suites: { specs: { tests: { results: { errors: typeof errors }[] }[] }[] }[]
        }
        stats = report.stats
        errors = report.suites.flatMap(suite =>
          suite.specs.flatMap(spec =>
            spec.tests.flatMap(test => test.results.flatMap(result => result.errors)),
          ),
        )
      } catch {
        /* CLI argument failures may precede reporter creation. */
      }
    }
    try {
      const result = await exec(process.execPath, args, { cwd: dir, timeout: 30_000 })
      capture(result.stdout, result.stderr)
    } catch (err) {
      const result = err as Error & { code: number; stdout: string; stderr: string }
      code = result.code
      capture(result.stdout, result.stderr)
    }
    const marker = await readFile(join(dir, 'body.marker'), 'utf8').catch(() => undefined)
    const hookMarker = await readFile(join(dir, 'hook.marker'), 'utf8').catch(() => undefined)
    return { code, output, marker, hookMarker, stats, errors, specSource }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
