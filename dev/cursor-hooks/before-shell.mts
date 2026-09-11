import * as path from 'node:path'

import { cursorPayloadSessionId, persistRealSessionId } from '../agent-session-id/persist.mts'
import { isAutomationContext, readHookPayload } from '../codex-hooks/policy.mts'
import { cursorBeforeShellOutput } from './before-shell-output.mts'

const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const payload = readHookPayload()
persistRealSessionId(worktreeRoot, 'cursor', cursorPayloadSessionId(payload))
process.stdout.write(
  cursorBeforeShellOutput(payload, {
    automationContext: isAutomationContext(),
  }),
)
