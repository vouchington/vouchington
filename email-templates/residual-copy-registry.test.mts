import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const directory = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(directory, '..')
const allowedByLocale = new Set(['crm-outreach-copy.mts', 'crm-outreach.tsx'])

function findResidualProductCopy(root: string): string[] {
  return readdirSync(root, { encoding: 'utf8', recursive: true }).filter(name => {
    if (!name.endsWith('.mts') && !name.endsWith('.tsx')) return false
    if (name.includes('.test.')) return false
    const source = readFileSync(join(root, name), 'utf8')
    const localeRegistry = source.includes('ByLocale') && !allowedByLocale.has(name)
    const localeBranch = /locale === '(?:en|es|fr|pt)'/.test(source) && name !== 'catalog-copy.mts'
    return localeRegistry || localeBranch
  })
}

describe('residual product copy registries', () => {
  it('keeps locale registries out of catalog-backed product copy', () => {
    expect(findResidualProductCopy(directory)).toEqual([])
    expect(existsSync(join(repoRoot, 'ts-shared/ui-messages/messages'))).toBe(false)
    expect(existsSync(join(repoRoot, 'dev/localization/import.mts'))).toBe(false)
  })

  it('finds locale registries nested below the template root', () => {
    const root = mkdtempSync(join(tmpdir(), 'voucha-email-copy-'))
    try {
      mkdirSync(join(root, 'nested'))
      writeFileSync(join(root, 'nested', 'catalog.tsx'), 'const copy = emailCopy(locale)\n')
      writeFileSync(
        join(root, 'nested', 'residual.tsx'),
        'const nestedCopyByLocale = { en: "Hello" }\n',
      )

      expect(findResidualProductCopy(root)).toEqual([join('nested', 'residual.tsx')])
    } finally {
      rmSync(root, { force: true, recursive: true })
    }
  })
})
