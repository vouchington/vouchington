import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '../../..')
const SCAN_DIR = join(REPO_ROOT, 'backend')
const ALLOWED_FILES = new Set(['backend/services/email-classification/send.mts'])
const SEND_EMAIL_MODULE = '@modules/aws/ses'
const SEND_GMAIL_EMAIL_MODULE = '@modules/gmail-smtp'

function getSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return getSourceFiles(path)
    return entry.isFile() && path.endsWith('.mts') ? [path] : []
  })
}

function findDirectSendImports(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  if (source.includes(SEND_EMAIL_MODULE)) found.push(SEND_EMAIL_MODULE)
  if (source.includes(SEND_GMAIL_EMAIL_MODULE)) found.push(SEND_GMAIL_EMAIL_MODULE)
  return found
}

describe('sendEmail / sendGmailEmail choke point', () => {
  it('is only imported directly by email-classification/send.mts', () => {
    const violations: string[] = []
    for (const file of getSourceFiles(SCAN_DIR)) {
      const relPath = relative(REPO_ROOT, file)
      if (ALLOWED_FILES.has(relPath)) continue
      if (relPath.endsWith('.test.mts')) continue

      const imports = findDirectSendImports(file)
      if (imports.length > 0) violations.push(`${relPath}: ${imports.join(', ')}`)
    }

    expect(violations).toEqual([])
  })
})
