import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const oxlint = resolve('node_modules/.bin/oxlint')

const cases = [
  { name: 'root', directory: '', config: '.oxlintrc.json' },
  { name: 'backend agent', directory: 'backend/agents', config: 'backend/agents/.oxlintrc.json' },
  { name: 'Cloudflare Worker', directory: 'cloudflare-worker', config: '.oxlintrc.json' },
] as const

describe('effective TypeScript Oxlint plugin', () => {
  let fixtureRoot: string

  beforeAll(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'voucha-typescript-plugin-'))
    writeFileSync(
      join(fixtureRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2024',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowImportingTsExtensions: true,
          noEmit: true,
        },
        include: ['**/*.mts'],
      }),
    )
  })

  afterAll(() => {
    rmSync(fixtureRoot, { force: true, recursive: true })
  })

  it.each(cases)(
    'enforces syntax and type-aware rules for $name with its real config',
    testCase => {
      const directory = join(fixtureRoot, testCase.directory)
      mkdirSync(directory, { recursive: true })
      const dependency = join(directory, 'promise-source.mts')
      const invalid = join(directory, 'invalid.mts')
      const valid = join(directory, 'valid.mts')
      writeFileSync(
        dependency,
        'export function pending(): Promise<void> { return Promise.resolve() }\n',
      )
      writeFileSync(
        invalid,
        "import { pending } from './promise-source.mts'\nexport enum Invalid { First = 1, Second = 1 }\npending()\n",
      )
      writeFileSync(
        valid,
        "import { pending } from './promise-source.mts'\nexport enum Valid { First = 1, Second = 2 }\nawait pending()\n",
      )

      const result = spawnSync(
        oxlint,
        [
          '--type-aware',
          '--tsconfig',
          join(fixtureRoot, 'tsconfig.json'),
          '--config',
          resolve(testCase.config),
          '--format',
          'json',
          invalid,
          valid,
        ],
        { cwd: fixtureRoot, encoding: 'utf8', timeout: 20_000 },
      )
      expect(result.error).toBeUndefined()
      expect(result.signal).toBeNull()
      const { diagnostics } = JSON.parse(result.stdout) as {
        diagnostics: Array<{ code: string; filename: string }>
      }
      expect(
        diagnostics.filter(({ filename }) => resolve(fixtureRoot, filename) === valid),
      ).toEqual([])
      expect(
        diagnostics
          .map(({ code, filename }) => ({ code, filename: resolve(fixtureRoot, filename) }))
          .toSorted((a, b) => a.code.localeCompare(b.code)),
      ).toEqual([
        { code: 'typescript(no-duplicate-enum-values)', filename: invalid },
        { code: 'typescript(no-floating-promises)', filename: invalid },
      ])
      expect(result.status).toBe(1)
    },
  )
})
