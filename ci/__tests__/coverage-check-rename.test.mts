import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

function makeChildProcessEnv(extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  )
  return { ...env, ...extraEnv }
}

describe('coverage-check rename handling', () => {
  it('does not report unchanged lines from a large pure move as patch lines', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'voucha-coverage-check-renames-'))
    const git = (args: string[]) =>
      execFileSync('git', args, {
        cwd: repoDir,
        encoding: 'utf8',
        env: makeChildProcessEnv({
          GIT_AUTHOR_NAME: 'T',
          GIT_AUTHOR_EMAIL: 't@t.com',
          GIT_COMMITTER_NAME: 'T',
          GIT_COMMITTER_EMAIL: 't@t.com',
        }),
      })

    try {
      git(['init', '-q'])
      mkdirSync(join(repoDir, 'src'))
      for (let i = 1; i <= 20; i++) {
        writeFileSync(join(repoDir, 'src', `file-${i}.mts`), `export const value${i} = ${i};\n`)
      }
      git(['add', 'src'])
      git(['commit', '-q', '-m', 'base'])
      const baseSha = git(['rev-parse', 'HEAD']).trim()

      git(['config', 'diff.renameLimit', '1'])
      mkdirSync(join(repoDir, 'moved'))
      for (const fileName of readdirSync(join(repoDir, 'src'))) {
        renameSync(join(repoDir, 'src', fileName), join(repoDir, 'moved', fileName))
      }
      rmSync(join(repoDir, 'src'), { recursive: true, force: true })
      git(['add', '.'])
      git(['commit', '-q', '-m', 'move files'])
      const headSha = git(['rev-parse', 'HEAD']).trim()

      const changedLinesSize = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          [
            'const { getChangedLines } = await import(process.argv[1])',
            'const changedLines = await getChangedLines(process.argv[2], process.argv[3])',
            'console.log(changedLines.size)',
          ].join(';'),
          import.meta.resolve('coverage-check/src/diff-parser.mts'),
          baseSha,
          headSha,
        ],
        { cwd: repoDir, encoding: 'utf8', env: makeChildProcessEnv() },
      ).trim()

      expect(changedLinesSize).toBe('0')
    } finally {
      rmSync(repoDir, { recursive: true, force: true })
    }
  })
})
