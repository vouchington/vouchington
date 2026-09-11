import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const adminRoot = join(process.cwd(), 'web/app/admin')

function collectTsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return collectTsxFiles(path)
    if (entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) {
      return [path]
    }
    return []
  })
}

const classLikeStringPattern = /(['"`])([^'"`\n]*\bp-8\b[^'"`\n]*)\1/g
const barePagePaddingWrapperPattern =
  /<div\s+className=['"]p-8['"]>\s*(?:<h1\s+className=['"]sr-only['"]|<Breadcrumbs\b)/g

function hasToken(tokens: Set<string>, token: string): boolean {
  return tokens.has(token)
}

function hasTokenPrefix(tokens: Set<string>, prefix: string): boolean {
  return [...tokens].some(token => token.startsWith(prefix))
}

function isForbiddenPageWrapperClass(value: string): boolean {
  const tokens = new Set(value.trim().split(/\s+/))
  if (!hasToken(tokens, 'p-8')) return false
  return (
    hasToken(tokens, 'mx-auto') ||
    hasTokenPrefix(tokens, 'max-w-') ||
    hasTokenPrefix(tokens, 'space-y-')
  )
}

describe('admin page layout spacing', () => {
  it('does not add legacy page-level padding inside the shared admin shell', () => {
    const offenders = collectTsxFiles(adminRoot).flatMap(file => {
      const source = readFileSync(file, 'utf8')
      const relativeFile = file.replace(`${process.cwd()}/`, '')
      const classOffenders = [...source.matchAll(classLikeStringPattern)].reduce<string[]>(
        (acc, match) => {
          if (match[2] && isForbiddenPageWrapperClass(match[2]))
            acc.push(`${relativeFile}: ${match[2]}`)
          return acc
        },
        [],
      )
      const barePagePaddingOffenders = [...source.matchAll(barePagePaddingWrapperPattern)].map(
        () => `${relativeFile}: className='p-8' page wrapper`,
      )

      return [...classOffenders, ...barePagePaddingOffenders]
    })

    expect(offenders).toEqual([])
  })
})
