#!/usr/bin/env node
// PostToolUse hook (Claude Code; Cursor and Grok via Claude-compat): runs the repository's
// post-edit checkers on the edited path and prints their warnings as advisory context. Always
// exits 0; any error is swallowed so a hook problem never blocks a tool call.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { checkFile } from './post-edit-checkers.mts'

type Payload = {
  tool_input?: { file_path?: string; path?: string }
  toolInput?: { file_path?: string; filePath?: string; path?: string }
}

export function editedPath(payload: Payload): string | undefined {
  const input = payload.tool_input ?? payload.toolInput
  const candidate =
    input?.file_path ?? (input as { filePath?: string } | undefined)?.filePath ?? input?.path
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

export function renderContext(messages: readonly string[]): string {
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: messages.join('\n') },
  })
}

function main(): void {
  const filePath = editedPath(JSON.parse(readFileSync(0, 'utf8')) as Payload)
  if (filePath === undefined) return
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const warnings = checkFile(filePath, root)
  if (warnings.length > 0) process.stdout.write(`${renderContext(warnings.map(w => w.message))}\n`)
}

if (import.meta.main) {
  try {
    main()
  } catch {
    // Advisory hook: never fail the tool call.
  }
}
