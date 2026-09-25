import * as path from 'node:path'
import { readHookPayload } from '../codex-hooks/hook-payload.mts'
import { checkFile } from '../codex-hooks/post-tool-use-policy.mts'
import { cursorEditedFilePath } from './payload.mts'

const payload = readHookPayload()
const filePath = cursorEditedFilePath(payload)
if (filePath) {
  const worktreeRoot = path.resolve(import.meta.dirname, '../..')
  const warnings = checkFile(filePath, worktreeRoot)
  for (const warning of warnings) {
    process.stdout.write(`[${warning.level}] ${warning.message}\n`)
  }
}
