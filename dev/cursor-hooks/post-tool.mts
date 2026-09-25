import * as path from 'node:path'

import { cursorPayloadSessionId, persistRealSessionId } from '../agent-session-id/persist.mts'
import { readHookPayload } from '../codex-hooks/hook-payload.mts'
import { renderPostToolReminder } from '../tmux-reminder-post-tool.mts'
import { remapCursorPostToolPayload } from './payload.mts'

const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const remapped = remapCursorPostToolPayload(readHookPayload())
persistRealSessionId(worktreeRoot, 'cursor', cursorPayloadSessionId(remapped))

// Was: shell out to dev/tmux-agent-reminder's `post-tool` case. That case was deleted when
// Claude/Codex moved onto renderPostToolReminder (dev/tmux-reminder-post-tool.mts) directly, so
// this now calls the same in-process function instead of a bash script that no longer exists.
// Cursor's remapped payload carries a real `tool_response.exit_code` (see
// remapCursorPostToolPayload), so this restores the original script's exit-code gate for Cursor
// specifically. Output shape matches emit_json's `PostToolUse` JSON exactly, since this is the
// same shape Cursor's postToolUse hook has always received via that script.
try {
  const tmuxPane = process.env.TMUX_PANE ?? ''
  const reminder = tmuxPane === '' ? null : renderPostToolReminder(remapped, tmuxPane)
  if (reminder) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: { additionalContext: reminder, hookEventName: 'PostToolUse' },
      })}\n`,
    )
  }
} catch {
  // Fail-open: this hook must never block, delay, or surface noise for the calling tool.
}
