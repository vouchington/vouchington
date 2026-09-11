import { hookFilePath } from './policy/hook-payload.mts'
import { readHookPayload } from './policy.mts'
import { checkFile } from './post-tool-use-policy.mts'
import * as path from 'node:path'

const payload = readHookPayload()
const filePath = hookFilePath(payload)
if (filePath) {
  const worktreeRoot = path.resolve(import.meta.dirname, '../..')
  const warnings = checkFile(filePath, worktreeRoot)
  for (const w of warnings) {
    process.stdout.write(`[${w.level}] ${w.message}\n`)
  }
}
