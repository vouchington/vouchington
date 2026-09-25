import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock, preToolUseOutput } from '../codex-hooks/policy.mts'
import { hookCwd } from '../codex-hooks/policy/core.mts'
import { keyLooksPathLike } from '../codex-hooks/policy/claire-paths.mts'
import {
  extractToolCommand,
  hookFilePath,
  hookSessionId,
  resolvePreToolUseRuntime,
} from '../codex-hooks/hook-payload.mts'

describe('Grok hook payload helper', () => {
  it('reads Bash commands from toolInput.command', () => {
    expect(extractToolCommand({ toolInput: { command: 'git push --force origin main' } })).toBe(
      'git push --force origin main',
    )
  })

  it('still reads Claude tool_input.command', () => {
    expect(extractToolCommand({ tool_input: { command: 'git status' } })).toBe('git status')
  })

  it('resolves file paths from file_path, filePath, and path', () => {
    expect(hookFilePath({ tool_input: { file_path: 'a.ts' } })).toBe('a.ts')
    expect(hookFilePath({ toolInput: { filePath: 'b.ts' } })).toBe('b.ts')
    expect(hookFilePath({ toolInput: { path: 'c.ts' } })).toBe('c.ts')
    expect(hookFilePath({ file_path: 'cursor.ts' })).toBe('cursor.ts')
  })

  it('reads sessionId as well as session_id', () => {
    expect(hookSessionId({ sessionId: ' grok-sess ' })).toBe('grok-sess')
    expect(hookSessionId({ session_id: 'claude-sess' })).toBe('claude-sess')
    expect(hookSessionId({})).toBe('')
  })

  it('treats filePath as a path-like key', () => {
    expect(keyLooksPathLike('file_path')).toBe(true)
    expect(keyLooksPathLike('filePath')).toBe(true)
    expect(keyLooksPathLike('workspaceRoot')).toBe(true)
    expect(keyLooksPathLike('command')).toBe(false)
  })

  it('resolves cwd from toolInput and workspaceRoot', () => {
    expect(hookCwd({ toolInput: { cwd: '/work' } })).toBe('/work')
    expect(hookCwd({ workspaceRoot: '/root' })).toBe('/root')
  })
})

describe('Grok PreToolUse runtime', () => {
  it('overrides argv claude when GROK_SESSION_ID is set', () => {
    expect(resolvePreToolUseRuntime('claude', { GROK_SESSION_ID: 'sess' })).toBe('grok')
  })

  it('overrides argv claude when only GROK_HOOK_EVENT is set', () => {
    expect(resolvePreToolUseRuntime('claude', { GROK_HOOK_EVENT: 'pre_tool_use' })).toBe('grok')
  })

  it('does not treat GROK_AGENT as a hook-runtime signal', () => {
    expect(resolvePreToolUseRuntime('claude', { GROK_AGENT: 'grok-build' })).toBe('claude')
  })

  it('keeps argv claude when no GROK env is set', () => {
    expect(resolvePreToolUseRuntime('claude', {})).toBe('claude')
  })

  it('denies a Grok-native run_terminal_command force-push payload', () => {
    const output = preToolUseOutput(
      {
        toolName: 'run_terminal_command',
        toolInput: { command: 'git push --force origin main' },
      },
      { automationContext: false, runtime: 'grok' },
    )
    expect(JSON.parse(output)).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('Force pushes are banned'),
    })
  })

  it('lists Grok tool names on the shipped PreToolUse matcher', () => {
    const settings = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../.claude/settings.json'), 'utf8'),
    ) as { hooks: { PreToolUse: Array<{ matcher: string }> } }
    expect(settings.hooks.PreToolUse[0].matcher).toContain('run_terminal_command')
    expect(settings.hooks.PreToolUse[0].matcher).toContain('search_replace')
  })

  it('denies a force-push for grok runtime instead of emitting block', () => {
    const output = preToolUseOutput(
      { toolInput: { command: 'git push --force origin main' } },
      { automationContext: false, runtime: 'grok' },
    )
    expect(JSON.parse(output)).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('Force pushes are banned'),
    })
  })

  it('still blocks a Claude force-push with decision block', () => {
    const output = preToolUseOutput(
      { tool_input: { command: 'git push --force origin main' } },
      { automationContext: false, runtime: 'claude' },
    )
    expect(JSON.parse(output)).toEqual({
      decision: 'block',
      reason: expect.stringContaining('Force pushes are banned'),
    })
  })

  it('emits nothing for an interactive Grok merge confirm, even with attended inherited', () => {
    const output = preToolUseOutput(
      { toolInput: { command: 'gh pr merge 123 --squash' } },
      { attended: true, automationContext: false, runtime: 'grok' },
    )
    expect(output).toBe('')
  })

  it('denies an automated Grok merge instead of emitting block', () => {
    const output = preToolUseOutput(
      { toolInput: { command: 'gh pr merge 123 --squash' } },
      { automationContext: true, runtime: 'grok' },
    )
    expect(JSON.parse(output)).toEqual({
      decision: 'deny',
      reason: expect.stringContaining('never delegated to an agent'),
    })
  })

  it('blocks a Grok edit of a .claire path', () => {
    expect(
      findPreToolUseBlock({
        toolInput: { filePath: '.claire/settings.json' },
      })?.reason,
    ).toContain('.claire should be .claude')
  })
})
