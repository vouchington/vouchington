import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'

const MERGE_BLOCK = 'never delegated to an agent'

function automationBlock(command: string) {
  return findPreToolUseBlock({ tool_input: { command } }, { automationContext: true })
}

function interactiveWorkflowBlock(command: string) {
  return findGitHubWorkflowBlock(command, '/session', { automationContext: false })
}

function expectAutomationOnlyMergeBlock(command: string): void {
  expect(automationBlock(command)).toEqual({
    disposition: 'block',
    reason: expect.stringContaining(MERGE_BLOCK),
  })
  expect(interactiveWorkflowBlock(command)).toBeNull()
}

// In automation any command that names gh together with a merge is blocked without parsing how
// the merge is wrapped or spelled. See the hook threat model in docs/development/agent-sandbox.md.
describe('Codex hook coarse automation merge rule', () => {
  it.each([
    // #460: gh options before the action.
    'gh pr --squash=true merge 1',
    'gh pr --admin=true merge 1',
    'gh pr --squash merge 1',
    'gh -R owner/repo pr merge 1',
    // #461: an xargs placeholder inside a nested shell, env -S, or eval.
    `echo merge | xargs -I% sh -c "sh -c 'gh pr % 1'"`,
    'echo merge | xargs -I% env -S "gh pr % 1"',
    `echo merge | xargs -I% bash -c "eval 'gh pr % 1'"`,
    'echo merge | xargs gh pr',
    'echo merge | xargs -I% gh pr % 1',
  ])('blocks the #460 and #461 forms: %s', expectAutomationOnlyMergeBlock)

  it.each([
    'timeout 5 gh pr merge 1',
    'nice -n 5 gh pr merge 1',
    'sudo -u root gh pr merge 1',
    'npx gh pr merge 1',
    'pnpm exec gh pr merge 1',
    'mise exec -- gh pr merge 1',
    'noglob gh pr merge 1',
    'nocorrect gh pr merge 1',
    '- gh pr merge 1',
    '{fd}>out gh pr merge 1',
    'FOO+=1 gh pr merge 1',
    'a[1]=x gh pr merge 1',
    'env -C/tmp gh pr merge 1',
    'env - gh pr merge 1',
    '/usr/bin/env -C /tmp gh pr merge 1',
    'coproc m { gh pr merge 1; }',
    'f() { gh pr merge 1; }; f',
    'g() { gh "$@"; }; g pr merge 1',
  ])('blocks a merge behind any wrapper or shell prefix: %s', expectAutomationOnlyMergeBlock)

  it.each([
    'eval "gh pr merge 1"',
    'eval gh pr merge 1',
    'CMD="gh pr merge 1"; eval "$CMD"',
    'env -S "gh pr merge 1"',
    'env --split-string="gh pr merge 1"',
    'script -q -c "gh pr merge 1" /dev/null',
    "bash -euo pipefail -c 'gh pr merge 1'",
    String.raw`bash -c gh\ pr\ merge\ 1`,
    'bash -c "gh pr "merge" 1"',
    `bash -c 'gh pr '"merge 1"`,
    "bash <<< 'gh pr merge 1'",
    "cat <<< 'gh pr merge 1' | sh",
    '$(which gh) pr merge 1',
    'GH=gh; $GH pr merge 1',
    'echo 1 | xargs gh pr merge',
    String.raw`find . -exec gh pr merge 1 \;`,
    "parallel 'gh pr merge {}' ::: 1",
    'alias m="gh pr merge"',
    "gh alias set --shell m 'gh pr merge 1'",
  ])(
    'blocks a merge a shell, eval, env -S, or runner reads from a string: %s',
    expectAutomationOnlyMergeBlock,
  )

  it.each([
    'gh stack merge 7',
    'gh-stack merge 7',
    'gh extension exec stack merge 7',
    'env -C /tmp gh stack merge 7',
    'gh api -X PUT repos/owner/repo/pulls/123/merge',
    'gh api --method PUT repos/owner/repo/pulls/123/merge',
    'gh api repos/owner/repo/pulls/123/merge -XPUT',
    'gh api repos/owner/repo/pulls/123/merge --method=PUT',
    'gh -R owner/repo api -X PUT /repos/owner/repo/pulls/123/merge?foo=bar',
    'gh api repos/owner/repo/merges -f base=main -f head=feature',
    'gh api -X POST repos/owner/repo/merges?foo=bar',
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
  ])(
    'blocks gh stack merge and gh api merge endpoints and mutations: %s',
    expectAutomationOnlyMergeBlock,
  )

  it.each(['gh pr merge 1 && git push', 'git fetch && gh pr merge 1', 'gh pr merge 1 | tee log'])(
    'blocks a merge in a compound command: %s',
    expectAutomationOnlyMergeBlock,
  )

  // A run of backslashes inside an unterminated `bash -c "` used to backtrack exponentially,
  // holding the hook past its timeout before it reached the merge after it.
  it('reads past a long backslash run in an unterminated shell script', () => {
    const command = `echo 'x bash -c "${'\\'.repeat(64)}' ; gh pr merge 1`
    expect(automationBlock(command)?.reason).toContain(MERGE_BLOCK)
  })

  it('blocks by default when automationContext is omitted', () => {
    const command = 'gh api -X PUT repos/owner/repo/pulls/123/merge'
    expect(findPreToolUseBlock({ tool_input: { command } })?.disposition).toBe('block')
    expect(findGitHubWorkflowBlock(command, '/session')?.reason).toContain(MERGE_BLOCK)
  })
})

describe('Codex hook coarse automation merge rule — accepted overmatches', () => {
  it.each([
    // `gh` is an argument, a variable name, a duration, or a redirection target.
    'echo gh pr merge 1',
    'command -v gh pr merge 1',
    'env -u gh pr merge 1',
    'timeout gh pr merge 1',
    'nohup ! gh pr merge 1',
    '>gh pr merge 1',
    'eval echo gh pr merge 1',
    "bash -e ./deploy.sh 'gh pr merge 1'",
    // Quoted gh+merge text and here-strings.
    'git log --grep "gh pr merge"',
    'grep -r "gh pr merge" .',
    'git commit -m "fix: block gh pr merge"',
    "grep x <<< 'gh pr merge 1'",
    String.raw`bash -c echo\ gh\ pr\ merge\ 1`,
    "gh pr create --draft --title t --body 'Closes #1. Run gh pr merge 1 later.'",
    // `git merge` beside gh, merge help, and a GET of the merge endpoint.
    'gh pr checkout 1 && git merge main',
    'gh pr merge --help',
    'gh api repos/owner/repo/pulls/123/merge',
    'gh api repos/owner/repo/pulls/123/merge -X GET',
  ])(
    'blocks in automation and leaves it to the harness interactively: %s',
    expectAutomationOnlyMergeBlock,
  )
})

describe('Codex hook coarse automation merge rule — known misses', () => {
  // Out of scope per the hook threat model: obfuscated or indirect forms a cooperative agent does
  // not write. Each still names no gh merge the word-level check can see.
  it.each([
    // A variable or alias supplies gh or the action.
    '$GH pr merge 1',
    "gh alias set m 'pr merge'",
    // Brace expansion or a glob spells the action.
    'gh pr {merge,} 1',
    'gh pr merg? 1',
    // The mutation comes from a file.
    'gh api graphql -F query=@merge.graphql',
    // Quotes split gh, env -S escapes join the words, or an unmodeled wrapper hides the shell a
    // heredoc feeds.
    `bash -c g'h pr merge 1'`,
    String.raw`env -S 'gh\_pr\_merge\_1'`,
    "timeout 5 bash <<'EOF'\ngh pr merge 1\nEOF",
  ])('does not block: %s', command => {
    expect(automationBlock(command)).toBeNull()
  })
})

describe('Codex hook coarse automation merge rule — commands with no merge', () => {
  it.each([
    'gh api repos/owner/repo/pulls/123',
    'gh api user',
    "gh api graphql -f query='query { viewer { login } }'",
    'gh api repos/owner/repo/issues/123/comments -f body=hi',
    'gh pr view 1 --json mergeable,mergeStateStatus',
    'gh pr checks 1 && git merge-base HEAD main',
    'git merge feature',
    'gh pr view "$PR"',
    'eval "$(mise activate zsh)"',
    "gh pr list --json number -q '.[].number' | xargs -I{} gh api repos/o/r/pulls/{}/reviews",
    'echo repos/o/r/pulls | xargs -n1 gh api',
    // Comments and heredoc bodies no shell reads are data.
    'echo safe # gh pr merge 1',
    "gh pr create --draft --body-file - <<'EOF'\nCloses #1\ngh pr merge 1 now blocks\nEOF",
    "git commit -F - <<'EOF'\nfix: gh pr merge\nEOF",
    "cat > notes.md <<'EOF'\ngh pr merge 1\nEOF",
  ])('does not block: %s', command => {
    expect(automationBlock(command)).toBeNull()
  })
})
