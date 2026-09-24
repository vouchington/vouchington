import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

const MERGE_BLOCK = 'never delegated to an agent'
const MERGE_HEREDOC = "<<'EOF'\ngh pr merge 1\nEOF"
const MERGE_HERE_STRING = "<<< 'gh pr merge 1'"

function reasonFor(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } }, { automationContext: true })?.reason
}

// A heredoc or here-string is the script of whichever shell reads the command's stdin, however
// the command, its redirections, or its compound wrapper are written.
describe('Codex hook gh policies in a script a shell reads from stdin', () => {
  it.each([
    // env -S splits its string into the command it runs.
    'env -S bash',
    'env --split-string bash',
    'env --split-string=bash',
    'env -Sbash',
    'env -vS bash',
    'env -i -S bash',
    'env -C /tmp -S bash',
    'env -S sh',
    'env -S /bin/zsh',
    "env -S 'bash -s'",
    // Redirections around the shell word.
    'bash 2>&1',
    '2>/dev/null bash',
    // A `-c` after the first operand is a script argument, not the script.
    'bash -s -- -c',
    'bash -s x -c',
    'bash /dev/stdin -c',
    // A compound command passes its stdin to the commands inside it.
    '{ bash; }',
    '(bash)',
    'while true; do bash; break; done',
    'if true; then bash; fi',
    // An expansion chooses the command at run time.
    '$SHELL',
  ])('blocks a merge in a heredoc a shell reads: %s', command => {
    expect(reasonFor(`${command} ${MERGE_HEREDOC}`)).toContain(MERGE_BLOCK)
  })

  it.each([
    "bash<<'EOF'\ngh pr merge 1\nEOF",
    "<<'EOF' bash\ngh pr merge 1\nEOF",
    "cat<<'EOF'|bash\ngh pr merge 1\nEOF",
    "cat <<'EOF' | env -S bash\ngh pr merge 1\nEOF",
    "cat <<'EOF' |& bash\ngh pr merge 1\nEOF",
    "cat <<'EOF' | tee log | bash\ngh pr merge 1\nEOF",
    // The shell's heredoc is the second one on the line.
    "cat <<'A'; bash <<'B'\nx\nA\ngh pr merge 1\nB",
    // A shell-read body is a script even when it reads like prose.
    'cat <<EOF | bash\n- gh pr merge 1\nEOF',
  ])('blocks a merge in a heredoc a later pipeline stage or spacing hides: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each(['bash -s -- -c', '{ bash; }', '(bash)', 'env -S bash', '2>/dev/null bash'])(
    'blocks a merge in a here-string a shell reads: %s',
    command => {
      expect(reasonFor(`${command} ${MERGE_HERE_STRING}`)).toContain(MERGE_BLOCK)
    },
  )

  // `<<<` opens a here-string, not a heredoc, so the next line is a command, not a body.
  it.each(["cat <<< 'x'\ngh pr merge 1", "true <<< 'x'\nbash <<< 'gh pr merge 1'"])(
    'reads the line after a here-string as a command: %s',
    command => {
      expect(reasonFor(command)).toContain(MERGE_BLOCK)
    },
  )

  it.each([
    'x="$(cat <<EOF\n$(gh pr merge 1)\nEOF\n)"',
    'cat > f <<EOF\n$(gh pr merge 1)\nEOF',
    'cat > f <<EOF\n`gh pr merge 1`\nEOF',
    // Quotes and `#` are literal text in a heredoc body; the substitution still runs.
    "cat > f <<EOF\ndon't\n$(gh pr merge 1)\nEOF",
    'cat > f <<EOF\n# $(gh pr merge 1)\nEOF',
    // An escaped backslash leaves the `$` live.
    'cat > f <<EOF\n\\\\$(gh pr merge 1)\nEOF',
  ])('blocks a merge in a substitution an unquoted heredoc body runs: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    // Heredoc bodies no shell reads are data, whether or not the delimiter is quoted.
    'gh pr create --draft --title t --body "$(cat <<EOF\n## Summary\n- gh pr merge now blocks\nEOF\n)"',
    'git commit -F - <<EOF\nfix: x\n\n- gh pr merge now confirms\nEOF',
    'cat > notes.yml <<EOF\nsteps:\n  - gh pr merge 1\nEOF',
    'cat > notes.md <<EOF\ngh pr merge 1\nEOF',
    // A backslash escapes `$` and a backtick in an unquoted body, so neither substitution runs.
    'cat > notes.md <<EOF\n\\$(gh pr merge 1) and \\`gh pr merge 1\\`\nEOF',
    `: ${MERGE_HEREDOC}`,
    `cat > f ${MERGE_HEREDOC}`,
    `gh pr create --draft --title t --body-file - ${MERGE_HEREDOC}`,
    `git commit -F - ${MERGE_HEREDOC}`,
    `git commit -m "$(cat ${MERGE_HEREDOC}\n)"`,
    `python3 - ${MERGE_HEREDOC}`,
    // A `-c` script replaces stdin as the shell's script.
    `bash -c 'echo hi' ${MERGE_HEREDOC}`,
    `bash -c true ${MERGE_HERE_STRING}`,
    `bash -e -c true ${MERGE_HEREDOC}`,
  ])('does not gate a heredoc or here-string no shell runs: %s', command => {
    expect(reasonFor(command)).toBeUndefined()
  })
})
