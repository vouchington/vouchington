import * as path from 'node:path'

import { cursorPayloadSessionId, persistRealSessionId } from '../agent-session-id/persist.mts'
import { readHookPayload } from '../codex-hooks/hook-payload.mts'
import { isAutomationContext } from '../codex-hooks/policy.mts'
import { cursorBeforeShellOutput } from './before-shell-output.mts'

const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const payload = readHookPayload()
persistRealSessionId(worktreeRoot, 'cursor', cursorPayloadSessionId(payload))
process.stdout.write(
  cursorBeforeShellOutput(payload, {
    automationContext: isAutomationContext(),
  }),
)
