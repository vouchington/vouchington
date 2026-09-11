import { spawnSync } from 'node:child_process'
import * as path from 'node:path'

import {
  cursorPayloadSessionId,
  resolveAndPersistSessionStartId,
} from '../agent-session-id/persist.mts'
import { readHookPayload } from '../codex-hooks/policy.mts'
import {
  additionalContextFromHookStdout,
  cursorSessionStartResponse,
} from './session-start-output.mts'

const worktreeRoot = path.resolve(import.meta.dirname, '../..')
const stdin = readHookPayload()
const payloadJson = JSON.stringify(stdin)

function runHookCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    cwd: worktreeRoot,
    encoding: 'utf8',
    input: payloadJson,
    timeout: 8_000,
  })
  return result.stdout ?? ''
}

const contexts = [
  runHookCommand('/bin/bash', [
    path.join(worktreeRoot, 'dev/tmux-agent-reminder'),
    'session-start',
  ]),
  runHookCommand('/bin/bash', [path.join(worktreeRoot, 'dev/check-fresh-base')]),
  runHookCommand('/bin/bash', [path.join(worktreeRoot, 'dev/check-web-init')]),
].map(additionalContextFromHookStdout)

const { sessionId } = resolveAndPersistSessionStartId({
  agent: 'cursor',
  cwd: worktreeRoot,
  payloadId: cursorPayloadSessionId(stdin),
})
process.stdout.write(cursorSessionStartResponse(sessionId, contexts))
