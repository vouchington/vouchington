import { hookFilePath, readHookPayload } from './hook-payload.mts'
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
