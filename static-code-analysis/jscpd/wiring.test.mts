import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JSCPD_CONFIG_PATH, readIgnoreGlobs } from './ignore-globs.mts'

const RUNNER = 'node static-code-analysis/run-jscpd.mts'
const README = readFileSync('static-code-analysis/jscpd/README.md', 'utf8')
const configGlobs = readIgnoreGlobs(readFileSync(JSCPD_CONFIG_PATH, 'utf8'))

describe('jscpd wiring', () => {
  it('makes package, lint, workflow, and ci-local callers invoke the same runner', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(packageJson.scripts.jscpd).toBe(RUNNER)
    expect(packageJson.scripts.lint).toContain('pnpm run jscpd')
    expect(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')).toContain(
      'run: pnpm run jscpd',
    )
    expect(readFileSync('ci/ci-local/targets.mts', 'utf8')).toContain("'pnpm run jscpd'")
  })

  it('documents every configured ignore glob in the jscpd README', () => {
    const undocumented = configGlobs.filter(glob => !README.includes(`\`${glob}\``))
    expect(undocumented).toEqual([])
  })

  it('lists only configured globs in the README exceptions table', () => {
    const tableGlobs = [...README.matchAll(/^\| `([^`]+)` +\|/gm)].map(match => match[1])
    expect(tableGlobs.filter(glob => !configGlobs.includes(glob ?? ''))).toEqual([])
  })
})
