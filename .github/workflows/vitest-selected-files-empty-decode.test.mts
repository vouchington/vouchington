import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression test for the bug this file was added to catch: every reusable Vitest test
// workflow decodes VITEST_SELECTED_FILES with the same bash snippet (see
// vouchington-tooling/gha-selected-files). `<<<` always appends exactly one trailing newline, so
// an empty VITEST_SELECTED_FILES (the full-suite case, where the caller forwards `''`)
// still makes `read` succeed once with file="" before the next `read` hits EOF. Without
// a blank-line guard inside the loop, that turns "no narrowed selection" into
// `FILES=("")` — a single stray empty-string positional argument appended to the vitest
// command line — instead of `FILES=()`. These workflows have no outer `-z` guard before
// the read loop (unlike tests-web.yml/tests-backend-unit.yml/tests-playwright.yml, which
// branch around the loop entirely on empty input), so the guard must live inside the
// loop itself.
const workflowDir = '.github/workflows'

const unguardedFiles = [
  'tests-backend-credentialed.yml',
  'tests-backend-modules.yml',
  'tests-cloudflare-worker.yml',
  'tests-lambdas.yml',
  'tests-portability.yml',
  'tests-postgres-schema.yml',
  'tests-tooling.yml',
  'tests-ts-shared.yml',
]

function extractReadLoops(source: string): string[] {
  const matches = [
    ...source.matchAll(
      /FILES=\(\)\n\s*while IFS= read -r file; do\n[\s\S]*?\n\s*done <<< "\$VITEST_SELECTED_FILES"/g,
    ),
  ]
  return matches.map(match => match[0])
}

describe('VITEST_SELECTED_FILES read loop decodes an empty selection to zero files', () => {
  it.each(unguardedFiles)('%s', file => {
    const source = readFileSync(join(workflowDir, file), 'utf8')
    const readLoops = extractReadLoops(source)
    expect(readLoops.length).toBeGreaterThan(0)

    for (const readLoop of readLoops) {
      const result = spawnSync('bash', ['-c', `${readLoop}\nprintf '%s\\n' "\${#FILES[@]}"`], {
        encoding: 'utf8',
        env: { ...process.env, VITEST_SELECTED_FILES: '' },
      })
      expect(result.status).toBe(0)
      expect(result.stdout.trim()).toBe('0')
    }
  })

  it('still preserves a real narrowed selection, including paths with spaces or glob characters', () => {
    const source = readFileSync(join(workflowDir, 'tests-backend-credentialed.yml'), 'utf8')
    const [readLoop] = extractReadLoops(source)
    const result = spawnSync('bash', ['-c', `${readLoop}\nprintf '%s\\0' "\${FILES[@]}"`], {
      encoding: 'utf8',
      env: {
        ...process.env,
        VITEST_SELECTED_FILES: 'backend/needs space/foo.test.mts\nbackend/glob-*-star.test.mts',
      },
    })
    expect(result.status).toBe(0)
    expect(result.stdout.split('\0').filter(Boolean)).toEqual([
      'backend/needs space/foo.test.mts',
      'backend/glob-*-star.test.mts',
    ])
  })
})
