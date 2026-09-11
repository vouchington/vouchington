import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

describe('no-mistakes forbidden-calls config', () => {
  it('applies the general analyzer repeatedly across test layers', () => {
    const source = readFileSync(`${repoRoot}/.no-mistakes.yml`, 'utf8')
    const config = parseYaml(source) as {
      rules: Array<{ include?: string[]; name: string; options?: unknown; rule: string }>
    }

    expect(config.rules.filter(candidate => candidate.rule === 'forbidden-calls')).toEqual([
      {
        name: 'Vitest tests do not invoke real timers',
        rule: 'forbidden-calls',
        scope: 'repository',
        options: {
          roots: [{ vitest: true }],
          traversal: 'file',
          unknownCalls: 'ignore',
          targets: [
            { global: 'setTimeout' },
            { moduleExport: { module: 'node:timers', export: 'setTimeout' } },
            { moduleExport: { module: 'node:timers/promises', export: 'setTimeout' } },
          ],
        },
      },
      {
        name: 'Playwright tests do not invoke fixed sleeps',
        rule: 'forbidden-calls',
        scope: 'repository',
        options: {
          roots: [{ playwright: true }],
          traversal: 'file',
          unknownCalls: 'ignore',
          targets: [
            { global: 'setTimeout' },
            { terminal: 'waitForTimeout' },
            { moduleExport: { module: 'node:timers', export: 'setTimeout' } },
            { moduleExport: { module: 'node:timers/promises', export: 'setTimeout' } },
          ],
        },
      },
      {
        name: 'integration tests do not call mock helpers',
        rule: 'forbidden-calls',
        scope: 'repository',
        include: ['integration-tests/**/*.mts'],
        options: {
          roots: [{ vitest: true }],
          traversal: 'file',
          unknownCalls: 'ignore',
          targets: [
            { exact: 'vi.mock' },
            { exact: 'vi.doMock' },
            { exact: 'vi.importMock' },
            { exact: 'vi.fn' },
            { exact: 'vi.spyOn' },
            { exact: 'vi.stubGlobal' },
            { exact: 'jest.mock' },
            { exact: 'jest.doMock' },
          ],
        },
      },
    ])
    expect(source).not.toContain('forbiddenCalls:')
  })
})
