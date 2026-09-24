import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'

const MERGE_BLOCK = 'never delegated to an agent'
const FIND_EXEC_BLOCK = '-exec/-execdir/-ok/-okdir clause can run a gh command'
const PARALLEL_BLOCK = '`parallel` can run a gh command'

function reasonFor(command: string): string | undefined {
  return findPreToolUseBlock({ tool_input: { command } })?.reason
}

// #436: exec-style wrappers outside the #432 grammar (sudo, stdbuf, caffeinate, unbuffer, setsid,
// arch, script, npx, pnpm exec, mise exec, watch) used to hide gh from the command-position check.
describe('Codex hook gh policies behind exec-style wrappers', () => {
  it.each([
    'sudo gh pr merge 1',
    'sudo GH_TOKEN=x gh pr merge 1',
    'stdbuf -o0 gh pr merge 1',
    'stdbuf --output=0 gh pr merge 1',
    'caffeinate -i gh pr merge 1',
    'caffeinate -t 60 gh pr merge 1',
    'caffeinate -w 123 gh pr merge 1',
    'unbuffer gh pr merge 1',
    'setsid gh pr merge 1',
    'setsid -f gh pr merge 1',
    'arch -arm64 gh pr merge 1',
    'arch -arch arm64 gh pr merge 1',
    'arch -x86_64 gh pr merge 1',
    'arch -32 gh pr merge 1',
    'arch -d SOMEVAR gh pr merge 1',
    'script -q /dev/null gh pr merge 1',
    'npx gh pr merge 1',
    'pnpm exec gh pr merge 1',
    'mise exec -- gh pr merge 1',
    'mise exec node@20 -- gh pr merge 1',
    'watch gh pr merge 1',
    'watch -n 2 gh pr merge 1',
    'watch --interval=2 gh pr merge 1',
  ])('blocks a merge behind an exec-style wrapper: %s', command => {
    expect(reasonFor(command)).toContain(MERGE_BLOCK)
  })

  it.each([
    'find . -exec gh pr merge 1 \\;',
    'find . -execdir gh pr merge 1 \\;',
    "find . -exec sh -c 'gh pr merge 1' \\;",
    'find . -exec gh pr merge 1 +',
    'find . -ok gh pr merge 1 \\;',
  ])('fails closed on a find -exec/-execdir/-ok clause that mentions gh: %s', command => {
    expect(reasonFor(command)).toContain(FIND_EXEC_BLOCK)
  })

  it.each(["parallel 'gh pr merge {}' ::: 1", 'parallel gh pr merge ::: 1'])(
    'fails closed on a parallel template that mentions gh: %s',
    command => {
      expect(reasonFor(command)).toContain(PARALLEL_BLOCK)
    },
  )

  it.each([
    'find . -exec grep x {} \\;',
    'find . -name "*.gh" -exec echo {} \\;',
    'sudo ls',
    'sudo GH_TOKEN=x gh pr view 1',
    'pnpm exec vitest',
    'npx --yes prettier --write .',
    'parallel gzip ::: *.log',
    'watch date',
    'arch',
    'find . -exec sh -c \'echo "$1"\' _ {} \\;',
    'find . -exec grep -l "$PAT" {} +',
    'parallel echo "$HOME/{}" ::: a b',
  ])('does not gate an ordinary exec-style command: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })).toBeNull()
  })
})
