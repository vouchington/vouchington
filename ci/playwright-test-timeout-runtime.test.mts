import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const guardPath = fileURLToPath(new URL('../playwright/config/test-timeout.mts', import.meta.url))
const modules = fileURLToPath(new URL('../node_modules', import.meta.url))
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url))
const capError =
  /positive finite number at most 30,000 ms|slow modifiers are forbidden|timeout guard overrides are forbidden/

async function runFixture(
  body: string,
  options: { collection?: string; cliTimeout?: string; extended?: boolean } = {},
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
    await writeFile(
      join(dir, 'tiny.spec.mts'),
      `
      import { test as raw } from '@playwright/test'
      import { writeFileSync } from 'node:fs'
      import { guardPlaywrightTestTimeouts } from ${JSON.stringify(guardPath)}
      const guarded = guardPlaywrightTestTimeouts(raw)
      const test = ${options.extended ? `guarded.extend({ sample: async ({}, use) => await use('fixture') })` : 'guarded'}
      ${options.collection ?? ''}
      test('tiny public boundary', async (${options.extended ? '{ sample }' : '{}'}, info) => {
        ${body}
        writeFileSync(${JSON.stringify(join(dir, 'body.marker'))}, 'continued')
      })
    `,
    )
    const args = [cli, 'test', '--config', join(dir, 'playwright.config.mts')]
    if (options.cliTimeout !== undefined) args.push('--timeout', options.cliTimeout)
    let code = 0
    let output = ''
    let stats: { expected: number; unexpected: number } | undefined
    const capture = (stdout: string, stderr: string) => {
      output = stdout + stderr
      try {
        stats = (JSON.parse(stdout) as { stats: typeof stats }).stats
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
    return { code, output, marker, stats }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('Playwright public timeout runtime', () => {
  it.each([
    ['computed test setter', `test['set' + 'Timeout'](30001)`],
    ['zero test setter', 'test.setTimeout(0)'],
    ['infinite test setter', 'test.setTimeout(Infinity)'],
    ['info setter', 'info.setTimeout(30001)'],
    ['computed info setter', `info['set' + 'Timeout'](0)`],
    ['infinite info setter', 'info.setTimeout(Infinity)'],
    ['aliased test setter', 'const setter = test.setTimeout; setter(30001)'],
    ['bound info setter', 'const setter = info.setTimeout.bind(info); setter(30001)'],
    ['replacement test setter', 'test.setTimeout = () => {}; test.setTimeout(30001)'],
    ['replacement slow', 'test.slow = () => {}; test.slow()'],
    ['test.info instance', 'test.info().setTimeout(30001)'],
    ['test slow', 'test.slow()'],
    ['computed test slow', `test['sl' + 'ow']()`],
    ['info slow', 'info.slow()'],
    ['aliased info slow', 'const slow = info.slow.bind(info); slow()'],
    ['replacement info setter', 'info.setTimeout = () => {}; info.setTimeout(30001)'],
  ])('rejects %s before continuing the body', async (name, body) => {
    const result = await runFixture(body)
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(
      name.startsWith('replacement') ? /read only|Cannot assign/ : capError,
    )
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['setter', 'info.setTimeout(30001)'],
    ['slow', 'info.slow()'],
    ['aliased setter', 'const setter = info.setTimeout.bind(info); setter(0)'],
  ])('installs the info guard before beforeEach %s', async (_name, hook) => {
    const result = await runFixture('', {
      collection: `test.beforeEach(async ({}, info) => { ${hook} })`,
    })
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it.each([
    ['descendant setter', `const child = test.extend({}); child.setTimeout(30001)`],
    ['descendant slow', `const child = test.extend({}); child.slow()`],
    ['suite setter', `const configure = test.describe.configure; configure({ timeout: 30001 })`],
    ['collection slow', 'test.slow()'],
    ['extend guard replacement', 'test.extend({ vouchaTestTimeout: undefined })'],
    ['use guard replacement', 'test.use({ vouchaTestTimeout: undefined })'],
  ])('rejects %s during collection', async (_name, collection) => {
    const result = await runFixture('', { collection })
    expect(result.code).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it.each(['0', 'Infinity', '30001'])(
    'rejects resolved CLI timeout %s before body',
    async cliTimeout => {
      const result = await runFixture('', { cliTimeout })
      expect(result.code).toBe(1)
      expect(result.output).toMatch(/positive finite number at most 30,000 ms|timeout.*number/i)
      expect(result.marker).toBeUndefined()
    },
  )

  it.each([
    ['extended computed setter', `test['set' + 'Timeout'](30001)`],
    ['extended info setter', 'info.setTimeout(30001)'],
    ['extended slow', 'test.slow()'],
  ])('rejects %s in an inherited automatic fixture', async (_name, body) => {
    const result = await runFixture(body, { extended: true })
    expect(result.code).toBe(1)
    expect(result.stats?.unexpected).toBe(1)
    expect(result.output).toMatch(capError)
    expect(result.marker).toBeUndefined()
  })

  it('runs legal public setters and extended fixtures at the CLI ceiling', async () => {
    const result = await runFixture(
      `
    test.setTimeout(30000)
    const setter = info.setTimeout.bind(info)
    setter(25000)
    if (sample !== 'fixture') throw new Error('extended fixture lost')
    if (test.info() !== info) throw new Error('different public info instance')
  `,
      { cliTimeout: '30000', extended: true },
    )
    expect(result.code).toBe(0)
    expect(result.marker).toBe('continued')
    expect(result.stats).toMatchObject({ expected: 1, unexpected: 0 })
  })
})
