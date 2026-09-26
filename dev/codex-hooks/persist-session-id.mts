import * as path from 'node:path'

import { persistHookSessionStart } from '../agent-session-id/persist.mts'
import { readHookPayload, resolvePreToolUseRuntime } from './hook-payload.mts'

// SessionStart persistence for the Claude-compat runtimes that have no session-id env (Grok and
// Cursor); Claude itself resolves to no-op. argv[2] is the `claude` token from .claude/settings.json.
const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const payload = readHookPayload()
persistHookSessionStart(
  resolvePreToolUseRuntime(process.argv[2], process.env, payload),
  payload,
  process.env,
  worktreeRoot,
)
