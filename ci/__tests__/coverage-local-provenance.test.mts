import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  explicitSuiteCommand,
  runLocalCoverageSuiteCli,
  stampLocalCoverageSuite,
  validateLocalCoverageArtifacts,
} from '../coverage-local-provenance.mts'

describe('local coverage provenance', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true })
    roots.length = 0
  })

  it('stamps a generated suite and validates the signed pair', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'local-coverage-signed-'))
    roots.push(artifacts)
    const pair = join(artifacts, 'tooling')
    mkdirSync(pair)
    writeFileSync(
      join(pair, 'lcov.info'),
      `TN:\nSF:${resolve('ci/coverage-local-utils.mts')}\nDA:1,1\nend_of_record\n`,
    )

    stampLocalCoverageSuite('tooling', artifacts)

    expect(validateLocalCoverageArtifacts(artifacts)).toEqual([pair])
    expect(JSON.parse(readFileSync(join(pair, 'coverage-manifest.json'), 'utf8'))).toMatchObject({
      run: null,
      suite: 'tooling',
    })
  })

  it('rejects unsigned and stale local LCOV artifacts', () => {
    const artifacts = mkdtempSync(join(tmpdir(), 'local-coverage-reject-'))
    roots.push(artifacts)
    const pair = join(artifacts, 'tooling')
    mkdirSync(pair)
    writeFileSync(
      join(pair, 'lcov.info'),
      `SF:${resolve('ci/coverage-local-utils.mts')}\nDA:1,1\nend_of_record\n`,
    )
    expect(() => validateLocalCoverageArtifacts(artifacts)).toThrow('Unsigned coverage artifact')

    stampLocalCoverageSuite('tooling', artifacts)
    const manifestPath = join(pair, 'coverage-manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { revision: string }
    manifest.revision = '0'.repeat(40)
    writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`)
    expect(() => validateLocalCoverageArtifacts(artifacts)).toThrow(
      'Coverage manifest identity does not match',
    )
  })

  it('builds the explicit suite command with a scoped output directory', () => {
    expect(explicitSuiteCommand('web-api', 'coverage-custom')).toEqual({
      command:
        'pnpm exec vitest run --project web-api --coverage --coverage.all=true --coverage.reportsDirectory=coverage-custom/web-api',
      outputDirectory: 'coverage-custom/web-api',
    })
  })

  it('normalizes one package-manager separator before parsing suite arguments', () => {
    for (const argv of [
      ['missing'],
      ['--', 'missing'],
      ['--', 'missing', '--output', 'coverage-custom'],
    ]) {
      expect(() => runLocalCoverageSuiteCli(argv)).toThrow('Unknown local coverage suite: missing')
    }
  })

  it('rejects --output without a nonempty artifacts directory', () => {
    expect(() => runLocalCoverageSuiteCli(['tooling', '--output'])).toThrow(
      'Usage: pnpm run coverage:suite -- <suite> [--output <artifacts-dir>]',
    )
    expect(() => runLocalCoverageSuiteCli(['tooling', '--output', ''])).toThrow(
      'Usage: pnpm run coverage:suite -- <suite> [--output <artifacts-dir>]',
    )
    expect(() => runLocalCoverageSuiteCli(['tooling', '--output', '   '])).toThrow(
      'Usage: pnpm run coverage:suite -- <suite> [--output <artifacts-dir>]',
    )
  })
})
