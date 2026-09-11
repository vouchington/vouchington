import * as path from 'node:path'

import { persistGrokSessionStart } from '../agent-session-id/persist.mts'
import { readHookPayload } from './policy.mts'

const worktreeRoot = path.resolve(import.meta.dirname, '../..')
persistGrokSessionStart(readHookPayload(), process.env, worktreeRoot)
