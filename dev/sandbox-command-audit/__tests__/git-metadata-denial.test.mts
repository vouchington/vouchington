import { describe, expect, it } from 'vitest'

import { isGitMetadataPermissionDenial } from '../git-metadata-denial.mts'

describe('isGitMetadataPermissionDenial', () => {
  it('recognizes Git after a newline-separated shell prologue', () => {
    expect(
      isGitMetadataPermissionDenial(
        'set -e\ngit push -u origin topic',
        'error: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('ignores unquoted shell comments between Git setup and execution', () => {
    expect(
      isGitMetadataPermissionDenial(
        'set -e\n# publish branch\ngit push -u origin topic',
        'error: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('does not attribute an explicit non-Git metadata operation to another segment', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git status; rm /repo/.git/config',
        'rm: /repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
  })

  it('splits backgrounded non-Git commands without treating redirections as boundaries', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git status & rm /repo/.git/config',
        'rm: /repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
    expect(
      isGitMetadataPermissionDenial(
        'git push -u origin topic 2>&1',
        'error: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('does not fall back to an unrelated Git segment when a later path is expanded', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git status; rm "$TARGET"',
        'rm: /repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
  })

  it('rejects ambiguous mixed-command scripts even when Git names the same path', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git update-ref refs/heads/topic abc123; rm "$TARGET"',
        'rm: /repo/.git/refs/heads/topic.lock: Operation not permitted',
      ),
    ).toBe(false)
  })

  it('recognizes local branch ref write denials', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git update-ref refs/heads/topic abc123',
        "fatal: Unable to create '/repo/.git/refs/heads/topic.lock': Permission denied",
      ),
    ).toBe(true)
  })

  it('recognizes tag ref write denials', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git tag release',
        "fatal: Unable to create '/repo/.git/refs/tags/release.lock': Operation not permitted",
      ),
    ).toBe(true)
  })

  it('recognizes packed-ref lockfile denials', () => {
    expect(
      isGitMetadataPermissionDenial(
        'cd /repo && git pack-refs --all',
        "fatal: Unable to create '/repo/.git/packed-refs.lock': Permission denied",
      ),
    ).toBe(true)
  })

  it('recognizes stash ref and reflog denials', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git stash push',
        "fatal: Unable to create '/repo/.git/refs/stash.lock': Permission denied",
      ),
    ).toBe(true)
    expect(
      isGitMetadataPermissionDenial(
        'git stash push',
        'error: unable to append to logs/refs/stash: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('preserves exit-zero push denials followed by harmless reporting', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git push -u origin topic && echo pushed',
        'error: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('does not treat redirected reporting commands as harmless', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git status; echo changed > "$TARGET"',
        '/repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
  })

  it.each(['git status; echo "$(rm "$TARGET")"', 'git status; echo "`rm "$TARGET"`"'])(
    'does not treat reporting with command substitution as harmless: %s',
    command => {
      expect(
        isGitMetadataPermissionDenial(command, 'rm: /repo/.git/config: Operation not permitted'),
      ).toBe(false)
    },
  )

  it('recognizes Git after a quoted environment assignment', () => {
    expect(
      isGitMetadataPermissionDenial(
        "GIT_SSH_COMMAND='ssh -o ProxyCommand=a|b -i key' git push -u origin topic",
        'error: could not lock config file /repo/.git/config: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('recognizes Git invoked through env plus an assignment prefix', () => {
    expect(
      isGitMetadataPermissionDenial(
        'env GIT_EDITOR=true git rebase --continue',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Permission denied",
      ),
    ).toBe(true)
    expect(
      isGitMetadataPermissionDenial(
        '/usr/bin/env -i GIT_EDITOR=true git rebase --continue',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Permission denied",
      ),
    ).toBe(true)
  })

  it('recognizes notes ref and reflog write denials without enumerating the namespace', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git notes add -m note',
        "fatal: Unable to create '/repo/.git/refs/notes/commits.lock': Permission denied",
      ),
    ).toBe(true)
    expect(
      isGitMetadataPermissionDenial(
        'git notes add -m note',
        'error: unable to append to logs/refs/notes/commits: Operation not permitted',
      ),
    ).toBe(true)
  })

  it('does not treat displayed denial-shaped content as a Git diagnostic', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git show HEAD:dev/sandbox-command-audit/__tests__/git-metadata-denial.test.mts',
        '/repo/.git/worktrees/x/index.lock: Permission denied',
      ),
    ).toBe(false)
    expect(
      isGitMetadataPermissionDenial(
        'git diff HEAD -- fixtures/denial.txt',
        '/repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
  })

  it('recognizes read-only filesystem denials on Git metadata writes', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git rebase --continue',
        "fatal: Unable to create '/repo/.git/worktrees/x/index.lock': Read-only file system",
      ),
    ).toBe(true)
    expect(
      isGitMetadataPermissionDenial(
        'git update-ref refs/heads/topic abc123',
        "fatal: Unable to create '/repo/.git/refs/heads/topic.lock': EROFS",
      ),
    ).toBe(true)
  })

  it('rejects command substitution in a Git environment assignment', () => {
    expect(
      isGitMetadataPermissionDenial(
        'X="$(rm /repo/.git/config)" git status',
        'rm: /repo/.git/config: Operation not permitted',
      ),
    ).toBe(false)
  })

  it('allows inert quoted and escaped shell syntax in Git arguments', () => {
    const errorText =
      "fatal: Unable to create '/repo/.git/refs/heads/topic.lock': Permission denied"
    expect(
      isGitMetadataPermissionDenial("git commit -m 'literal <tag> and $(not-executed)'", errorText),
    ).toBe(true)
    expect(
      isGitMetadataPermissionDenial(
        'git commit -m "literal \\$(not-executed) and \\<tag\\>"',
        errorText,
      ),
    ).toBe(true)
  })

  it('requires .git context for absolute ref-like paths', () => {
    expect(
      isGitMetadataPermissionDenial(
        'git status > /readonly/refs/heads/result',
        '/readonly/refs/heads/result: Permission denied',
      ),
    ).toBe(false)
  })

  it('rejects a slash-rich non-match without regex backtracking', () => {
    expect(isGitMetadataPermissionDenial('git status', 'a/'.repeat(50_000))).toBe(false)
  }, 1_000)

  it('parses the command once when output contains many denial tokens', () => {
    const command = `echo ${'argument '.repeat(5_000)}`
    const errorText =
      "fatal: Unable to create '/repo/.git/refs/heads/topic.lock': Permission denied\n".repeat(
        5_000,
      )
    expect(isGitMetadataPermissionDenial(command, errorText)).toBe(false)
  }, 1_000)
})
