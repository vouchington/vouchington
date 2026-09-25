import { describe, expect, it } from 'vitest'

import { isGitPushInvocation } from '../command-match.mts'
import {
  commandsFromCodexCall,
  isCodexCallOutputFailure,
  isStructuredFailure,
} from '../codex-calls.mts'

function execCall(input: string): Record<string, unknown> {
  return { type: 'custom_tool_call', name: 'exec', input }
}

// Redacted (workdir replaced with a generic path), otherwise verbatim: captured from a
// live 2026-07-31 Codex rollout. `git push` appears only inside two `rg` search
// patterns, never as an actual invocation — `cmd` is unquoted (the JS object-literal
// shape #8149 reports as unparsed) but the value itself is entirely double-quoted, so
// this fixture exercises the unquoted-key bug only, not the brace/quote-tracking one.
const REAL_RG_PATTERN_NEGATIVE_PROGRAM = String.raw`const r = await tools.exec_command({cmd:"for f in .github/workflows/codex-fix-main.yml .github/workflows/codex-fix-issue.yml .github/workflows/codex-fix-dependabot.yml .github/workflows/codex-scheduled.yml .github/workflows/codex-pr-shepherd.yml; do echo ==== $f; rg -n \"uses: .*codex-dispatch|publish-contract|publish-base-ref|publish-target|title-prefix|title-suffix|prompt:|codex-completion|codex-duplicate|gh pr|git push|codex-pr.txt\" \"$f\"; done; echo '--- prompts residuals'; rg -n \"codex-pr.txt|codex-duplicate-issue|gh pr create|git push|open.*PR|opening.*PR|push|commit|completion.json|completion artifact\" .github/workflows/*prompt* .github/workflows/codex-* 2>/dev/null | head -300",workdir:"/workspace/worktrees/5",yield_time_ms:10000,max_output_tokens:30000});
text(r.output);`

// Redacted the same way: a genuine `git push` buried mid-pipeline in a temp-bare-remote
// test scaffold from the same rollout. Mixes an unquoted `cmd` key with JSON-quoted
// `"workdir"`/`"yield_time_ms"`/`"max_output_tokens"` keys in the same object literal —
// real Codex clients emit this mixed shape, not just uniformly-unquoted or uniformly-JSON.
const REAL_GIT_PUSH_POSITIVE_PROGRAM = String.raw`const r = await tools.exec_command({cmd:"tmp=$(mktemp -d /tmp/git-fetch-sha.XXXXXX); mkdir -p \"$tmp/remote\"; git -C \"$tmp/remote\" init -q --bare; mkdir \"$tmp/src\"; git -C \"$tmp/src\" init -q; git -C \"$tmp/src\" -c user.name=x -c user.email=x commit --allow-empty -qm init; sha=$(git -C \"$tmp/src\" rev-parse HEAD); git -C \"$tmp/src\" push -q \"$tmp/remote\" HEAD:refs/heads/main; mkdir \"$tmp/dst\"; git -C \"$tmp/dst\" init -q; git -C \"$tmp/dst\" remote add origin \"$tmp/remote\"; git -C \"$tmp/dst\" fetch --no-tags origin \"$sha\"; rc=$?; echo rc=$rc sha=$sha; rm -rf \"$tmp\"; exit $rc","workdir":"/workspace/worktrees/5","yield_time_ms":10000,"max_output_tokens":3000});
text(r.output);`

describe('commandsFromCodexCall — direct function_call / custom_tool_call arguments', () => {
  it('extracts cmd from JSON function_call arguments', () => {
    const payload = {
      type: 'function_call',
      name: 'exec_command',
      arguments: JSON.stringify({ cmd: 'pnpm run no-mistakes' }),
    }
    expect(commandsFromCodexCall(payload)).toEqual(['pnpm run no-mistakes'])
  })

  it('accepts the command alias field', () => {
    const payload = {
      type: 'function_call',
      name: 'bash',
      arguments: JSON.stringify({ command: 'git status' }),
    }
    expect(commandsFromCodexCall(payload)).toEqual(['git status'])
  })

  it('falls back to the raw custom_tool_call input when it is not JSON', () => {
    const payload = { type: 'custom_tool_call', name: 'shell', input: 'pnpm run no-mistakes' }
    expect(commandsFromCodexCall(payload)).toEqual(['pnpm run no-mistakes'])
  })

  it('returns nothing for a call name it does not recognize', () => {
    expect(commandsFromCodexCall({ type: 'function_call', name: 'apply_patch' })).toEqual([])
  })
})

describe('commandsFromCodexCall — nested tools.exec_command(...) programs (#8149 cb1)', () => {
  it('extracts a cmd value written in unquoted-key JS object-literal syntax', () => {
    const program =
      'const r = await tools.exec_command({cmd:"pnpm run no-mistakes",workdir:"/workspace",yield_time_ms:10000,max_output_tokens:3000});\ntext(r.output);'
    expect(commandsFromCodexCall(execCall(program))).toEqual(['pnpm run no-mistakes'])
  })

  it('extracts a cmd value written in strict JSON syntax (JSON.parse fast path, non-regression)', () => {
    const program =
      'await tools.exec_command({"cmd":"git push origin main","workdir":"/workspace"});'
    const commands = commandsFromCodexCall(execCall(program))
    expect(commands).toEqual(['git push origin main'])
    expect(commands.some(isGitPushInvocation)).toBe(true)
  })

  it('extracts multiple embedded calls from the same program, in order', () => {
    const program = [
      'await tools.exec_command({cmd:"git status"});',
      'await tools.exec_command({"cmd":"git push origin HEAD"});',
    ].join('\n')
    expect(commandsFromCodexCall(execCall(program))).toEqual(['git status', 'git push origin HEAD'])
  })

  it("reads only the depth-1 cmd, never a nested object's own cmd/command key", () => {
    const program =
      'await tools.exec_command({meta:{cmd:"nested-should-be-ignored"},cmd:"top-level"});'
    expect(commandsFromCodexCall(execCall(program))).toEqual(['top-level'])
  })

  it('reads a backtick-quoted cmd value', () => {
    const program = 'await tools.exec_command({cmd:`echo hi`,workdir:"/workspace"});'
    expect(commandsFromCodexCall(execCall(program))).toEqual(['echo hi'])
  })

  it('decodes \\n, \\t, and \\r escapes in a loose-scanned cmd value instead of dropping the backslash', () => {
    // Multi-line scripts embedded in the JS-literal payload shape carry real \n/\t/\r
    // escapes. Before the fix, an escaped char was appended verbatim (`\n` -> the letter
    // `n`), silently corrupting the reconstructed command text.
    const program = String.raw`await tools.exec_command({cmd:"echo one\necho two\tindented\rcarriage"});`
    expect(commandsFromCodexCall(execCall(program))).toEqual([
      'echo one\necho two\tindented\rcarriage',
    ])
  })

  it('still decodes a non-whitespace escape (e.g. an embedded quote) to the raw character, unchanged', () => {
    const program = String.raw`await tools.exec_command({cmd:"echo \"quoted\""});`
    expect(commandsFromCodexCall(execCall(program))).toEqual(['echo "quoted"'])
  })

  it('tracks single- and backtick-quoted values (not just double quotes) so an embedded brace cannot mis-balance the object', () => {
    // Before the fix, the inner scanner only tracked `"`, so the unescaped `}` inside
    // this single-quoted value closed the object scan two characters into the string —
    // long before the object's real closing brace — and the command was silently dropped.
    const program = 'await tools.exec_command({cmd:\'echo }\',workdir:"/workspace"});'
    expect(commandsFromCodexCall(execCall(program))).toEqual(['echo }'])
  })

  it('leaves an unterminated call unresolved instead of extracting a truncated command', () => {
    const program = 'await tools.exec_command({cmd:"git status", unterminated: "no closing brace'
    expect(commandsFromCodexCall(execCall(program))).toEqual([])
  })

  it('ignores a decoy call mentioned inside a quoted string', () => {
    const program = `const decoy = 'tools.exec_command({"cmd":"git push decoy"})'`
    expect(commandsFromCodexCall(execCall(program))).toEqual([])
  })

  it('skips a call whose argument is not a JSON object literal and keeps scanning past it', () => {
    const program = [
      'await tools.exec_command(notJson);',
      'await tools.exec_command({cmd:"git status"});',
    ].join('\n')
    expect(commandsFromCodexCall(execCall(program))).toEqual(['git status'])
  })

  it('real fixture: extracts an rg search pattern that merely mentions git push, and does not classify it as one', () => {
    const commands = commandsFromCodexCall(execCall(REAL_RG_PATTERN_NEGATIVE_PROGRAM))
    expect(commands).toHaveLength(1)
    expect(commands[0]).toContain('git push')
    expect(commands.some(isGitPushInvocation)).toBe(false)
  })

  it('real fixture: extracts a genuine git push buried mid-pipeline behind mixed quoted/unquoted keys', () => {
    const commands = commandsFromCodexCall(execCall(REAL_GIT_PUSH_POSITIVE_PROGRAM))
    expect(commands).toHaveLength(1)
    expect(commands.some(isGitPushInvocation)).toBe(true)
  })
})

describe('isStructuredFailure', () => {
  it('matches a success: false payload, not just status or is_error', () => {
    expect(isStructuredFailure({ success: false })).toBe(true)
  })

  it('does not match a payload with no failure signal', () => {
    expect(isStructuredFailure({ status: 'completed' })).toBe(false)
  })
})

describe('isCodexCallOutputFailure', () => {
  it('matches a failed function_call_output or custom_tool_call_output', () => {
    expect(isCodexCallOutputFailure({ type: 'function_call_output', status: 'failed' })).toBe(true)
    expect(isCodexCallOutputFailure({ type: 'custom_tool_call_output', is_error: true })).toBe(true)
  })

  it('does not match a call record, even if it failed', () => {
    expect(isCodexCallOutputFailure({ type: 'custom_tool_call', status: 'failed' })).toBe(false)
  })
})
