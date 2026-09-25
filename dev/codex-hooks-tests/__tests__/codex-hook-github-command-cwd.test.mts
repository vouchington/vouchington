import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { commandCwd } from '../../codex-hooks/policy/github-command-cwd.mts'
import { commandPrefixAt } from '../../codex-hooks/policy/github-command-position.mts'
import { tokenizeShellWords } from '../../codex-hooks/policy-helpers.mts'
import { withTestTempDir } from '../test-temp-root.mts'

const BASE_CWD = '/filaments-session'
const PR_BODY = '## Related issues\nCloses #2476'

function tokensOf(command: string): string[] {
  return tokenizeShellWords(command, { splitRedirections: true })
}

function ghIndex(tokens: string[]): number {
  return tokens.findIndex(
    (token, index) => token === 'gh' && commandPrefixAt(tokens, index) !== null,
  )
}

function cwdFor(command: string, baseCwd = BASE_CWD): string | undefined {
  const tokens = tokensOf(command)
  return commandCwd(tokens, ghIndex(tokens), baseCwd)
}

describe('commandCwd sequential cd tracking', () => {
  it.each([
    ['cd /other && gh pr create --draft --fill', '/other'],
    ['cd /a && cd /b && gh pr create --draft --fill', '/b'],
    ['cd /a; gh pr create --draft --fill', '/a'],
    ['cd /a\ngh pr create --draft --fill', '/a'],
    ['cd -- /other && gh pr create --draft --fill', '/other'],
    ['cd -L /other && gh pr create --draft --fill', '/other'],
    ['command cd /other && gh pr create --draft --fill', '/other'],
    ['cd "$WORKTREE" && cd /abs && gh pr create --draft --fill', '/abs'],
    ['{ cd /other; }; gh pr create --draft --fill', '/other'],
    ['env -C /other gh pr create --draft --fill', '/other'],
    ['env --chdir=/other gh pr create --draft --fill', '/other'],
    ['env -C /a -C /b gh pr create --draft --fill', '/b'],
    ['cd /a && env -C b gh pr create --draft --fill', resolve('/a', 'b')],
    ['env -C /a nohup env -C b gh pr create --draft --fill', resolve('/a', 'b')],
  ])('applies sequential cd for %s', (command, expected) => {
    expect(cwdFor(command)).toBe(expected)
  })

  it('resolves relative cd against the session cwd', () => {
    expect(cwdFor('cd sub && gh pr create --draft --fill', '/base')).toBe(resolve('/base', 'sub'))
  })

  it.each([
    'cd /other | gh pr create --draft --fill',
    'cd /other & gh pr create --draft --fill',
    'echo cd /other && gh pr create --draft --fill',
    '(cd /wrong; true); gh pr create --draft --fill',
    'printf x | cd /other; gh pr create --draft --fill',
    'f() { cd /other; }; gh pr create --draft --fill',
    'function f { cd /other; }; gh pr create --draft --fill',
    'env cd /other && gh pr create --draft --fill',
  ])('keeps session cwd for %s', command => {
    expect(cwdFor(command)).toBe(BASE_CWD)
  })

  it.each([
    'cd /other || gh pr create --draft --fill',
    'cd $OTHER && gh pr create --draft --fill',
    'cd ~/repo && gh pr create --draft --fill',
    'cd /repo-* && gh pr create --draft --fill',
    'cd -P /other && gh pr create --draft --fill',
    'cd - && gh pr create --draft --fill',
    'cd && gh pr create --draft --fill',
    'if false; then cd /other; fi; gh pr create --draft --fill',
    'cd /primary || cd /fallback; gh pr create --draft --fill',
    'cd "$WORKTREE" && cd packages/api && gh pr create --draft --fill',
    'cd /other extra; gh pr create --draft --fill',
    'env -C "$OTHER" gh pr create --draft --fill',
    'cd $OTHER && env -C b gh pr create --draft --fill',
  ])('leaves cwd unknown for %s', command => {
    expect(cwdFor(command)).toBeUndefined()
  })

  it('lexically normalizes absolute cd paths', () => {
    expect(cwdFor('cd /work/link/.. && gh pr create --draft --fill')).toBe('/work')
  })

  it('inherits cwd into a following subshell', () => {
    expect(cwdFor('cd /right && (gh pr create --draft --fill)')).toBe('/right')
  })

  it('returns the shell cwd for a word that is an argument, not a command', () => {
    expect(commandCwd(tokensOf('cd /right && echo gh'), 4, BASE_CWD)).toBe('/right')
  })
})

describe('Codex hook GitHub policy uses command-local cwd', () => {
  it('reads a relative body file from the cd target', async () => {
    await withTestTempDir('voucha-cd-pr-session-', async sessionDir => {
      await withTestTempDir('voucha-cd-pr-body-', async otherDir => {
        await writeFile(join(sessionDir, 'pr-body.md'), '## Summary\nno closing ref\n')
        await writeFile(join(otherDir, 'pr-body.md'), `${PR_BODY}\n`)
        expect(
          findPreToolUseBlock({
            tool_input: {
              command: `gh pr create --draft --title "feat: test" --body-file pr-body.md`,
              cwd: sessionDir,
            },
          })?.reason,
        ).toContain('Closes #123')
        expect(
          findPreToolUseBlock({
            tool_input: {
              command: `cd ${otherDir} && gh pr create --draft --title "feat: test" --body-file pr-body.md`,
              cwd: sessionDir,
            },
          }),
        ).toBeNull()
      })
    })
  })

  it('uses gh-merge-base from the cd checkout', async () => {
    await withTestTempDir('voucha-cd-merge-base-', async dir => {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            key !== 'GIT_DIR' &&
            key !== 'GIT_WORK_TREE' &&
            key !== 'GIT_INDEX_FILE' &&
            key !== 'GIT_PREFIX',
        ),
      )
      execFileSync('git', ['init', '-q', '-b', 'feature-api'], { cwd: dir, env })
      execFileSync(
        'git',
        ['config', '--local', 'branch.feature-api.gh-merge-base', 'feature-auth'],
        { cwd: dir, env },
      )
      expect(
        findPreToolUseBlock({
          tool_input: {
            command: `cd ${dir} && gh pr create --draft --fill`,
            cwd: BASE_CWD,
          },
        })?.reason,
      ).toContain('PRs must target main')
    })
  })

  it('applies cd inside bash -lc inspected bodies', async () => {
    await withTestTempDir('voucha-cd-pr-session-', async sessionDir => {
      await withTestTempDir('voucha-cd-pr-body-', async otherDir => {
        await writeFile(join(sessionDir, 'pr-body.md'), '## Summary\nno closing ref\n')
        await writeFile(join(otherDir, 'pr-body.md'), `${PR_BODY}\n`)
        const command = (dir: string) =>
          `bash -lc "cd ${dir} && gh pr create --draft --title t --body-file pr-body.md"`
        expect(
          findPreToolUseBlock({ tool_input: { command: command(sessionDir), cwd: otherDir } })
            ?.reason,
        ).toContain('Closes #123')
        expect(
          findPreToolUseBlock({ tool_input: { command: command(otherDir), cwd: sessionDir } }),
        ).toBeNull()
      })
    })
  })
})
