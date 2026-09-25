import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

describe('Codex hook git -C global-option policy', () => {
  it.each([
    ['git -C /repo push --force origin main', 'Force pushes'],
    ['git -C "$root" push --force origin main', 'Force pushes'],
    ['git -C /repo commit --amend --no-edit', 'Commit amend'],
    ['git -C /repo pull --rebase', 'git pull --rebase'],
    ['git -C /repo checkout --ours package.json', 'checkout --ours'],
    ['git -C /repo commit -n -m "x"', '-n bypasses'],
    ['git -C /repo push --no-verify', '--no-verify'],
    ['git -C /repo rebase --continue', 'GIT_EDITOR=true git rebase --continue'],
    ['bash -lc "git -C /repo push --force origin main"', 'Force pushes'],
    ['git -C /repo -c user.name=x push --force origin main', 'Force pushes'],
    ['git -C /repo -c user.name="John Doe" push --force origin main', 'Force pushes'],
    ['git -c user.name=x commit --amend --no-edit', 'Commit amend'],
  ])('blocks banned git command through global options: %s', (command, reasonText) => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      })?.reason,
    ).toContain(reasonText)
  })

  it.each([
    'git -C /repo push --force-with-lease',
    'git -C /repo fetch origin && git -C /repo rebase origin/main',
    'GIT_EDITOR=true git -C /repo rebase --continue',
    'git -C /repo status',
  ])('allows sanctioned git -C form: %s', command => {
    expect(
      findPreToolUseBlock({
        tool_input: { command },
      }),
    ).toBeNull()
  })

  it('still blocks hooksPath override when mixed with -C', () => {
    expect(
      findPreToolUseBlock({
        tool_input: { command: 'git -C /repo -c core.hooksPath=/dev/null push' },
      })?.reason,
    ).toContain('core.hooksPath')
  })
})

describe('Codex hook git policy in a shell script after shell options', () => {
  it.each([
    ['bash -e -c "git push --force origin main"', 'Force pushes'],
    ['bash -euo pipefail -c "git commit --amend --no-edit"', 'Commit amend'],
    ["zsh -f -c 'git push --no-verify'", '--no-verify'],
    ["bash -e -c $'git push --force origin main'", 'Force pushes'],
    ['bash -e -c "git rebase --continue"', 'GIT_EDITOR=true git rebase --continue'],
  ])('blocks a banned git command: %s', (command, reasonText) => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(reasonText)
  })

  it('applies GIT_EDITOR=true from before the shell', () => {
    const command = 'GIT_EDITOR=true bash -e -c "git rebase --continue"'
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
    expect(
      findPreToolUseBlock({
        tool_input: { command: "GIT_EDITOR=true bash -c 'git rebase --continue'" },
      }),
    ).toBeNull()
  })
})

describe('Codex hook git policy in any quoting of a shell script', () => {
  it.each([
    [String.raw`bash -c git\ commit\ --amend`, 'Commit amend is banned'],
    ["bash -c 'git commit '--amend", 'Commit amend is banned'],
    ["bash <<< 'git commit --amend'", 'Commit amend is banned'],
    // Only a plain `GIT_EDITOR=true` sets the editor: `+=` appends to a value the hook cannot see.
    ['GIT_EDITOR+=true git rebase --continue', 'GIT_EDITOR=true git rebase --continue'],
    // A script pieced together from several quoted words never inherits an exported editor.
    [
      String.raw`export GIT_EDITOR=true; bash -c git\ rebase\ --continue`,
      'GIT_EDITOR=true git rebase --continue',
    ],
  ])('blocks a banned git command: %s', (command, reasonText) => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(reasonText)
  })
})
