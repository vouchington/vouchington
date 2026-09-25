import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

function blockReason(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } })?.reason
}

function commitWithHeredocMessage(body: string): string {
  return `git commit -F - <<'EOF'\nfix: example\n\n${body}\nEOF`
}

describe('Codex hook git policy command scope', () => {
  it.each([
    ['git push origin feature; tail -f log', 'force push'],
    ['git commit -m x && echo --amend', 'amend'],
    ['git pull origin main | grep -r foo', 'pull rebase'],
    ['git status && rg -X ours', 'strategy option'],
    ['git checkout main && grep -- --theirs notes.md', 'checkout ours/theirs'],
    ['git status | grep --no-verify', 'no-verify'],
    ['git commit -F msg | tail -n 20', 'commit -n'],
    ['git status; echo -c core.hooksPath=x', 'core.hooksPath'],
    ['git push origin $(git branch --show-current | head -1); tail -f log', 'force push'],
  ])('ignores a flag on a later command: %s (%s)', command => {
    expect(blockReason(command)).toBeUndefined()
  })

  it.each([
    ['git commit -m x -n', '-n bypasses'],
    ['git commit -m x && git push --no-verify', '--no-verify'],
    ['git commit -m x; git commit --amend', 'Commit amend'],
    ['git checkout main && git checkout --ours a.txt', 'checkout --ours'],
    ['git log\ngit push -f', 'Force pushes'],
    ['git push origin $(git branch --show-current) --force', 'Force pushes'],
    ['git push origin $(git branch --show-current | head -1) --force', 'Force pushes'],
    ['git push origin `git branch --show-current | head -1` --force', 'Force pushes'],
    ['git commit -m x --date $(date -u | tr -d Z) -n', '-n bypasses'],
    ["bash -c 'git commit -n -m x'", '-n bypasses'],
  ])('still blocks a banned flag on its own git command: %s', (command, reasonText) => {
    expect(blockReason(command)).toContain(reasonText)
  })

  it.each([
    'Never pass --no-verify or push --force.',
    'Docs say git push --force is banned.',
    'HUSKY=0 is banned.',
    'next dev',
    "bash -c 'git push --force'",
    'git rebase --continue',
  ])('treats a commit-message heredoc body as data: %s', body => {
    expect(blockReason(commitWithHeredocMessage(body))).toBeUndefined()
  })

  it('treats a heredoc message inside a quoted command substitution as data', () => {
    expect(
      blockReason(`git commit -m "$(cat <<'EOF'\nfix: example\n\nnever --no-verify\nEOF\n)"`),
    ).toBeUndefined()
  })

  it.each([
    'echo "see <<EOF"\ngit push --force',
    "echo 'see <<EOF'\ngit push --force",
    `git commit -m "$(cat <<'EOF'\nfix: example\nEOF\n)"\ngit push --force`,
  ])('still inspects a command after a quoted heredoc operator: %s', command => {
    expect(blockReason(command)).toContain('Force pushes')
  })

  it('keeps a quoted-delimiter heredoc body literal', () => {
    expect(blockReason("cat <<'EOF'\n$(git push --force)\nEOF")).toBeUndefined()
  })

  it.each([
    ["bash <<'EOF'\ngit push --force\nEOF", 'Force pushes'],
    ["cat <<'EOF' | bash\ngit push --force\nEOF", 'Force pushes'],
    ['cat <<EOF\n$(git push --force)\nEOF', 'Force pushes'],
    ["git commit -F - <<'EOF'\nmsg\nEOF\ngit push --force", 'Force pushes'],
    ["git commit -F - <<'EOF' && HUSKY=0 git push\nmsg\nEOF", 'HUSKY=0'],
    ["bash <<'EOF'\nbash -c 'git push --force'\nEOF", 'Force pushes'],
    ["cat <<EOF\n$(bash -c 'HUSKY=0 git push')\nEOF", 'HUSKY=0'],
  ])('still inspects heredoc text a shell runs: %s', (command, reasonText) => {
    expect(blockReason(command)).toContain(reasonText)
  })
})
