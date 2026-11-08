import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const OXLINT = resolve('node_modules/.bin/oxlint')
const RULES = [
  'typescript(no-unsafe-call)',
  'typescript(no-unsafe-return)',
  'typescript(no-unsafe-argument)',
]
// Synthetic unchecked SDK declarations exercise the repository's production/test routing.
const SOURCE = `declare const value: any
const acceptString = (input: string) => input
export const argument = acceptString(value)
export function call(): void { value() }
export function result(): string { return value }
`
const SCOPES = [
  '',
  'web',
  'backend/agents',
  'backend/scripts',
  'backend/services/crawler-rss',
  'backend/test-helpers/entities',
  'ci',
  'email-templates',
  'playwright',
  'static-code-analysis',
]

describe('production unsafe-value policy across Oxlint configs', () => {
  it.for(SCOPES)('checks production and exempts test fixtures under %s', async (scope, context) => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-unsafe-scope-'))
    try {
      writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
      mkdirSync(join(root, 'node_modules'))
      for (const dependency of ['typescript', 'oxlint-tsgolint']) {
        symlinkSync(
          resolve('node_modules', dependency),
          join(root, 'node_modules', dependency),
          'dir',
        )
      }
      const sources = [
        'source.ts',
        'source.stories.tsx',
        'source.test.ts',
        'source.spec.mts',
        '__tests__/source.tsx',
        'test-helpers/source.mts',
      ]
      const worker =
        scope === '' ? 'web/public/service-worker-probe.js' : 'public/service-worker-probe.js'
      if (scope === 'web') sources.push(worker)
      writeFileSync(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'esnext',
            module: 'nodenext',
            strict: true,
            noEmit: true,
            allowJs: true,
            types: [],
          },
          include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.js'],
        }),
      )
      for (const path of sources) {
        const file = join(root, path)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, path.endsWith('.js') ? "JSON.parse('{}')()\n" : SOURCE)
      }
      const run = await new Promise<{ stdout: string; stderr: string }>(resolveRun => {
        execFile(
          OXLINT,
          [
            '--config',
            resolve(scope, '.oxlintrc.json'),
            '--tsconfig',
            join(root, 'tsconfig.json'),
            '--threads',
            '1',
            '--type-aware',
            '--format',
            'json',
            ...sources,
          ],
          {
            cwd: root,
            encoding: 'utf8',
            signal: context.signal,
            env: { ...process.env, PATH: `${dirname(OXLINT)}:${process.env.PATH ?? ''}` },
          },
          (_error, stdout, stderr) => resolveRun({ stdout, stderr }),
        )
      })
      expect(run.stdout).toMatch(/^\s*\{/u)
      const parsed = JSON.parse(run.stdout) as {
        diagnostics: Array<{ code: string; filename: string }>
      }
      expect(parsed.diagnostics.filter(item => item.code === 'typescript(tsconfig-error)')).toEqual(
        [],
      )
      const findings = parsed.diagnostics.filter(item => RULES.includes(item.code))
      const expected =
        scope === 'backend/test-helpers/entities' ? [] : ['source.stories.tsx', 'source.ts']
      expect(
        [...new Set(findings.map(item => item.filename.replace(`${root}/`, '')))].toSorted(),
      ).toEqual(expected)
      for (const file of expected) {
        expect(
          findings
            .filter(item => item.filename.endsWith(`/${file}`) || item.filename === file)
            .map(item => item.code)
            .toSorted(),
        ).toEqual(RULES.toSorted())
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
