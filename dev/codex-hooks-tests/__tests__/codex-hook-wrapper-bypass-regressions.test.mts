import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

const MERGE_BLOCK = 'never delegated to an agent'
const EXPANSION_BLOCK = 'This gh subcommand comes from a shell expansion'
const STACK_ALLOWLIST_BLOCK = 'gh stack allowlist is closed'
const AMEND_BLOCK = 'Commit amend is banned'
const REBASE_EDITOR_BLOCK = 'GIT_EDITOR=true git rebase --continue'

function reasonFor(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } }, { automationContext: true })?.reason
}

// Shell forms the security review of the wrapper fix found still hid a gh merge from the hook.
describe('Codex hook gh policies behind shell forms the wrapper parser missed', () => {
  it.each([
    // zsh precommand modifiers.
    'noglob gh pr merge 1',
    'nocorrect gh pr merge 1',
    '- gh pr merge 1',
    // A named-descriptor redirection (`{fd}>`) before the command word.
    '{fd}>out gh pr merge 1',
    // `+=` and array-element assignments before the command word.
    'FOO+=1 gh pr merge 1',
    'a[1]=x gh pr merge 1',
    // bash `coproc NAME` before a compound command.
    'coproc m { gh pr merge 1; }',
  ])('blocks a merge after a shell prefix: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it('applies the gh stack allowlist after a zsh precommand modifier', () => {
    expect(reasonFor('noglob gh stack checkout 7')).toContain(STACK_ALLOWLIST_BLOCK)
  })

  it.each([
    // Every way to quote or escape a `-c` script, not only one whole quoted word.
    'bash -c gh\\ pr\\ merge\\ 1',
    'bash -c "gh pr "merge" 1"',
    'bash -c \'gh pr \'"merge 1"',
    "bash -c g'h pr merge 1'",
    // A shell reads a here-string as its script, as it would a heredoc body.
    "bash <<< 'gh pr merge 1'",
    "cat <<< 'gh pr merge 1' | sh",
    // env -S reads `\_` as a word separator outside double quotes and a space inside them.
    "env -S 'gh\\_pr\\_merge\\_1'",
    'env -S "gh\\_pr\\_merge\\_1"',
  ])('blocks a merge a shell or env runs from a string: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  // A run of backslashes inside an unterminated `bash -c "` used to backtrack exponentially,
  // holding the hook past its timeout before it reached the merge after it.
  it('reads past a long backslash run in an unterminated shell script', () => {
    const command = `echo 'x bash -c "${'\\'.repeat(64)}' ; gh pr merge 1`
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    // Brace expansion and globs choose the subcommand at run time.
    'gh pr {merge,} 1',
    'gh {pr,} merge 1',
    'gh -R o/r pr {merge,} 1',
    'gh pr -R o/r {merge,} 1',
    'gh pr merg? 1',
    // An alias forwards its later words, so an expansion without the full subcommand is gated.
    'gh alias set p pr',
    "gh alias set p 'pr'",
    'gh alias set p pr && gh p merge 1',
    "alias g='gh pr'",
    'alias g=gh',
    "alias g='gh pr'\ng merge 1",
  ])('fails closed when an expansion or alias supplies the gh subcommand: %s', command => {
    expect(reasonFor(command)).toContain(EXPANSION_BLOCK)
  })

  it.each([
    'bash -c git\\ commit\\ --amend',
    "bash -c 'git commit '--amend",
    "bash <<< 'git commit --amend'",
  ])('applies the git policy to a script in any quoting form: %s', command => {
    expect(reasonFor(command)).toContain(AMEND_BLOCK)
  })

  it.each([
    // Only a plain `GIT_EDITOR=true` sets the editor: `+=` appends to a value the hook cannot see.
    'GIT_EDITOR+=true git rebase --continue',
    // A script pieced together from several quoted words never inherits an exported editor.
    'export GIT_EDITOR=true; bash -c git\\ rebase\\ --continue',
  ])('requires a readable editor for rebase --continue: %s', command => {
    expect(reasonFor(command)).toContain(REBASE_EDITOR_BLOCK)
  })

  it.each([
    'echo x | xargs -I{} gh pr view {}',
    'gh api repos/{owner}/{repo}/pulls',
    "rg 'env -C /tmp gh pr merge 1' docs",
    'gh alias set co "pr checkout"',
    "alias ll='ls -la'",
    'eval "$(mise activate zsh)"',
    'noglob gh pr view 1',
    '{fd}>out gh pr view 1',
    "bash <<< 'gh pr view 1'",
    "grep x <<< 'gh pr merge 1'",
    'bash -c echo\\ gh\\ pr\\ merge\\ 1',
    "env -S 'gh\\_pr\\_view\\_1'",
    'GIT_EDITOR=true git rebase --continue',
    "GIT_EDITOR=true bash -c 'git rebase --continue'",
  ])('does not gate a command that runs no gh merge: %s', command => {
    expect(reasonFor(command)).toBeUndefined()
  })
})
