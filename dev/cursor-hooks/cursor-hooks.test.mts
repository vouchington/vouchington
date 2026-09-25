import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { cursorPayloadSessionId } from '../agent-session-id/persist.mts'
import { cursorBeforeShellOutput } from './before-shell-output.mts'
import { cursorEditedFilePath, remapCursorPostToolPayload } from './payload.mts'
import {
  additionalContextFromHookStdout,
  cursorSessionStartResponse,
} from './session-start-output.mts'

describe('cursorBeforeShellOutput', () => {
  it('denies a missing command instead of fail-opening', () => {
    expect(JSON.parse(cursorBeforeShellOutput({}))).toEqual({
      permission: 'deny',
      user_message: expect.stringContaining('missing a command'),
      agent_message: expect.stringContaining('missing a command'),
    })
  })

  it('allows an ordinary git status command', () => {
    expect(JSON.parse(cursorBeforeShellOutput({ command: 'git status' }))).toEqual({
      permission: 'allow',
    })
  })

  it('denies a force-push with Cursor permission JSON', () => {
    expect(
      JSON.parse(cursorBeforeShellOutput({ command: 'git push --force origin main' })),
    ).toEqual({
      permission: 'deny',
      user_message: expect.stringContaining('Force pushes are banned'),
      agent_message: expect.stringContaining('Force pushes are banned'),
    })
  })

  it('asks for an interactive merge, since only an attended Claude session gets the allow', () => {
    expect(
      JSON.parse(
        cursorBeforeShellOutput(
          { command: 'gh pr merge 123 --squash' },
          { automationContext: false },
        ),
      ),
    ).toEqual({
      permission: 'ask',
      user_message: expect.stringContaining('human decision'),
      agent_message: expect.stringContaining('human decision'),
    })
  })

  it('denies an automated merge', () => {
    expect(
      JSON.parse(
        cursorBeforeShellOutput(
          { command: 'gh pr merge 123 --squash' },
          { automationContext: true },
        ),
      ),
    ).toEqual({
      permission: 'deny',
      user_message: expect.stringContaining('never delegated to an agent'),
      agent_message: expect.stringContaining('never delegated to an agent'),
    })
  })
})

describe('cursorEditedFilePath', () => {
  it('prefers Cursor top-level file_path over nested tool_input', () => {
    expect(
      cursorEditedFilePath({
        file_path: 'web/app/page.tsx',
        tool_input: { file_path: 'ignored.ts' },
      }),
    ).toBe('web/app/page.tsx')
  })

  it('falls back to nested tool_input.file_path', () => {
    expect(cursorEditedFilePath({ tool_input: { file_path: 'backend/src/a.ts' } })).toBe(
      'backend/src/a.ts',
    )
  })
})

describe('remapCursorPostToolPayload', () => {
  it('maps Shell to Bash and lifts a top-level command', () => {
    expect(
      remapCursorPostToolPayload({
        command: './dev/reset-worktree',
        tool_name: 'Shell',
      }),
    ).toMatchObject({
      tool_name: 'Bash',
      tool_input: { command: './dev/reset-worktree' },
    })
  })

  it('lifts Cursor tool_output exitCode onto tool_response', () => {
    expect(
      remapCursorPostToolPayload({
        command: 'git push origin HEAD',
        tool_name: 'Shell',
        tool_output: JSON.stringify({ exitCode: 1 }),
      }),
    ).toMatchObject({
      tool_name: 'Bash',
      tool_input: { command: 'git push origin HEAD' },
      tool_response: { exit_code: 1 },
    })
  })

  it('keeps an existing Bash payload unchanged besides copying tool_input', () => {
    expect(
      remapCursorPostToolPayload({
        tool_input: { command: 'git push origin HEAD' },
        tool_name: 'Bash',
      }),
    ).toMatchObject({
      tool_name: 'Bash',
      tool_input: { command: 'git push origin HEAD' },
    })
  })
})

describe('cursor session-start output', () => {
  it('reads additionalContext from Claude hookSpecificOutput JSON', () => {
    expect(
      additionalContextFromHookStdout(
        JSON.stringify({
          hookSpecificOutput: {
            additionalContext: 'fresh-base warning',
            hookEventName: 'SessionStart',
          },
        }),
      ),
    ).toBe('fresh-base warning')
  })

  it('reads Cursor additional_context and plain-text stdout', () => {
    expect(additionalContextFromHookStdout(JSON.stringify({ additional_context: 'native' }))).toBe(
      'native',
    )
    expect(additionalContextFromHookStdout('plain reminder')).toBe('plain reminder')
    expect(additionalContextFromHookStdout('')).toBe('')
  })

  it('reads conversation_id when session_id is absent', () => {
    expect(cursorPayloadSessionId({ conversation_id: 'conv-1' })).toBe('conv-1')
  })

  it('reads session_id and emits CURSOR_SESSION_ID with joined context', () => {
    expect(cursorPayloadSessionId({ session_id: ' sess-1 ' })).toBe('sess-1')
    expect(JSON.parse(cursorSessionStartResponse('sess-1', ['a', '', 'b']))).toEqual({
      additional_context: 'a\n\nb',
      env: { CURSOR_SESSION_ID: 'sess-1' },
    })
  })

  it('emits CURSOR_SESSION_ID even when additional_context is empty', () => {
    expect(JSON.parse(cursorSessionStartResponse('sess-1', []))).toEqual({
      env: { CURSOR_SESSION_ID: 'sess-1' },
    })
  })

  it('omits empty fields', () => {
    expect(JSON.parse(cursorSessionStartResponse('', []))).toEqual({})
  })
})

describe('dev/cursor-hooks/post-tool.mts (subprocess)', () => {
  const scriptPath = join(import.meta.dirname, 'post-tool.mts')

  function withFakeTmux(paneTitle: string): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'cursor-post-tool-'))
    writeFileSync(
      join(dir, 'tmux'),
      [
        '#!/usr/bin/env bash',
        'case "$1" in',
        `  display-message) printf '%s\\n' ${JSON.stringify(paneTitle)} ;;`,
        'esac',
        '',
      ].join('\n'),
      { mode: 0o755 },
    )
    return { dir, cleanup: () => rmSync(dir, { force: true, recursive: true }) }
  }

  // No session_id/conversation_id in these payloads: persistRealSessionId bails out on an empty
  // sanitized token, so this never writes a real session-persist file into this actual worktree.
  it('restores the tmux reminder for a Cursor Shell payload with a successful exit code — the confirmed regression', () => {
    const { dir, cleanup } = withFakeTmux('old-task')
    try {
      const result = spawnSync('node', [scriptPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1' },
        input: JSON.stringify({
          command: 'gh pr create --title x --body y',
          tool_name: 'Shell',
          tool_output: JSON.stringify({ exitCode: 0 }),
        }),
        timeout: 10_000,
      })
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      const parsed = JSON.parse(result.stdout) as {
        hookSpecificOutput: { additionalContext: string }
      }
      expect(parsed.hookSpecificOutput.additionalContext).toContain('PR created')
    } finally {
      cleanup()
    }
  })

  it('stays silent when Cursor reports a failed exit code', () => {
    const { dir, cleanup } = withFakeTmux('old-task')
    try {
      const result = spawnSync('node', [scriptPath], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ''}`, TMUX_PANE: '%1' },
        input: JSON.stringify({
          command: 'gh pr create --title x --body y',
          tool_name: 'Shell',
          tool_output: JSON.stringify({ exitCode: 1 }),
        }),
        timeout: 10_000,
      })
      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout).toBe('')
    } finally {
      cleanup()
    }
  })

  it('stays silent outside tmux', () => {
    const result = spawnSync('node', [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, TMUX_PANE: undefined },
      input: JSON.stringify({ command: 'gh pr create --title x --body y', tool_name: 'Shell' }),
      timeout: 10_000,
    })
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toBe('')
  })
})

describe('knip entries', () => {
  it('registers every node cursor-hooks command from hooks.json', () => {
    const knip = readFileSync(new URL('../../knip.jsonc', import.meta.url), 'utf8')
    const hooks = JSON.parse(
      readFileSync(new URL('../../.cursor/hooks.json', import.meta.url), 'utf8'),
    ) as { hooks: Record<string, Array<{ command: string }>> }

    const files = Object.values(hooks.hooks)
      .flat()
      .map(hook => hook.command)
      .filter(command => command.startsWith('node dev/cursor-hooks/'))
      .map(command => command.slice('node '.length))

    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      expect(knip).toContain(`"${file}"`)
    }
  })
})
