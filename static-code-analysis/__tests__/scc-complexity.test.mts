import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { buildSccArgs, type SccComplexityScope } from 'vouchington-tooling/scc-complexity'
import {
  checkSccComplexity,
  VOUCHINGTON_SCC_SCOPES,
  parseSccComplexityViolations,
  SCC_COMPLEXITY_ARGS,
  TOOLING_SCC_BASELINE,
} from '../scc-complexity/index.mts'

const EMPTY_BASELINE = { version: 1, entries: [] } as const

describe('scc-complexity', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeFixture(trackedFiles: string[]): Promise<SharedContext> {
    const repoRoot = await mkdtemp(join(tmpdir(), 'voucha-scc-complexity-'))
    testDirs.push(repoRoot)

    await Promise.all(
      ['.github', 'ci', 'dev', 'static-code-analysis'].map(path =>
        mkdir(join(repoRoot, path), { recursive: true }),
      ),
    )

    for (const file of trackedFiles) {
      await mkdir(dirname(join(repoRoot, file)), { recursive: true })
      await writeFile(join(repoRoot, file), 'export const value = true\n')
    }

    return {
      isInsideGitRepo: true,
      repoRoot,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
  }

  it('reports tracked production files with complexity above 50', () => {
    const report = JSON.stringify([
      {
        Files: [
          { Location: 'backend/too-complex.mts', Complexity: 51 },
          { Location: 'backend/at-limit.mts', Complexity: 50 },
          { Location: 'backend/untracked.mts', Complexity: 99 },
        ],
      },
    ])

    expect(
      parseSccComplexityViolations(
        report,
        new Set(['backend/too-complex.mts', 'backend/at-limit.mts']),
      ),
    ).toEqual([{ complexity: 51, file: 'backend/too-complex.mts' }])
  })

  it('sorts violations by descending complexity', () => {
    const report = JSON.stringify([
      {
        Files: [
          { Location: 'b.mts', Complexity: 60 },
          { Location: 'a.mts', Complexity: 80 },
        ],
      },
    ])

    expect(parseSccComplexityViolations(report, new Set(['a.mts', 'b.mts']))).toEqual([
      { complexity: 80, file: 'a.mts' },
      { complexity: 60, file: 'b.mts' },
    ])
  })

  it('encodes product and tooling scopes with test exclusions', () => {
    const toolingArgs = buildSccArgs(VOUCHINGTON_SCC_SCOPES[1])

    expect(SCC_COMPLEXITY_ARGS).toContain(String.raw`\.(test|spec)\.`)
    expect(SCC_COMPLEXITY_ARGS).toContain(
      '.git,fixtures,__tests__,test-helpers,static-code-analysis,ci,.github,dev',
    )
    expect(VOUCHINGTON_SCC_SCOPES).toEqual([
      expect.objectContaining({ includePaths: ['.'], name: 'product' }),
      { includePaths: ['.github', 'ci', 'dev', 'static-code-analysis'], name: 'tooling' },
    ])
    expect(toolingArgs).toContain('.git,fixtures,__tests__,test-helpers')
    expect(toolingArgs).toContain(String.raw`\.(test|spec)\.`)
    expect(TOOLING_SCC_BASELINE.entries.length).toBeGreaterThan(0)
  })

  it('formats errors for scanner violations', async () => {
    const ctx = await makeFixture(['backend/too-complex.mts'])
    const report = JSON.stringify([
      { Files: [{ Location: 'backend/too-complex.mts', Complexity: 72 }] },
    ])

    await expect(
      checkSccComplexity(ctx, reportForScope(report), { baseline: EMPTY_BASELINE }),
    ).resolves.toEqual({
      errors: [
        '::error file=backend/too-complex.mts::[product] backend/too-complex.mts: scc complexity 72 exceeds 50; simplify or split this file',
      ],
    })
  })

  it('reports tooling regressions above their numeric baseline ceiling', async () => {
    const ctx = await makeFixture(['dev/too-complex.mts'])
    const report = JSON.stringify([
      { Files: [{ Location: 'dev/too-complex.mts', Complexity: 61 }] },
    ])

    await expect(
      checkSccComplexity(
        ctx,
        (_outputPath, scope) =>
          Promise.resolve(scope?.name === 'tooling' ? report : '[{"Files":[]}]'),
        {
          baseline: {
            version: 1,
            entries: [{ scope: 'tooling', file: 'dev/too-complex.mts', complexity: 60 }],
          },
        },
      ),
    ).resolves.toEqual({
      errors: [
        '::error file=dev/too-complex.mts::[tooling] dev/too-complex.mts: scc complexity 61 exceeds baseline ceiling 60',
      ],
    })
  })

  it('returns a setup error when scc cannot run', async () => {
    const ctx = await makeFixture(['backend/file.mts'])

    await expect(
      checkSccComplexity(
        ctx,
        () => Promise.reject(new Error('scc executable not found; install with mise install')),
        { baseline: EMPTY_BASELINE },
      ),
    ).resolves.toEqual({
      errors: [
        '::error::scc-complexity failed: scc executable not found; install with mise install',
      ],
    })
  })

  it('runs the default scc process wrapper and reads its output file', async () => {
    const ctx = await makeFixture(['backend/file.mts'])
    const binDir = await mkdtemp(join(tmpdir(), 'voucha-fake-scc-'))
    testDirs.push(binDir)
    const executable = join(binDir, 'scc')
    await writeFile(
      executable,
      '#!/bin/sh\nwhile [ "$1" != "--output" ]; do shift; done\nprintf \'[{"Files":[]}]\' > "$2"\n',
    )
    await chmod(executable, 0o755)

    await expect(
      checkSccComplexity(ctx, undefined, { baseline: EMPTY_BASELINE, command: executable }),
    ).resolves.toEqual({ errors: [] })
  })

  it('reports missing and nonzero scc executables through the default wrapper', async () => {
    const ctx = await makeFixture(['backend/file.mts'])
    const binDir = await mkdtemp(join(tmpdir(), 'voucha-fake-scc-'))
    testDirs.push(binDir)
    const executable = join(binDir, 'scc')
    await writeFile(executable, '#!/bin/sh\nprintf failure >&2\nexit 9\n')
    await chmod(executable, 0o755)

    await expect(
      checkSccComplexity(ctx, undefined, {
        baseline: EMPTY_BASELINE,
        command: join(binDir, 'missing-scc'),
      }),
    ).resolves.toEqual({
      errors: [
        '::error::scc-complexity failed: scc executable not found; install with mise install',
      ],
    })
    const report = await checkSccComplexity(ctx, undefined, {
      baseline: EMPTY_BASELINE,
      command: executable,
    })
    expect(report.errors[0]).toContain('scc-complexity failed:')
  })
})

function reportForScope(report: string) {
  return (_outputPath: string, scope?: SccComplexityScope) =>
    Promise.resolve(scope?.name === 'product' ? report : '[{"Files":[]}]')
}
