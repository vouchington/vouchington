import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return collectPageFiles(path)
    return entry.name === 'page.tsx' ? [path] : []
  })
}

describe('(my)/my auth redirects', () => {
  it('does not define page-level login next redirects', () => {
    const root = join(import.meta.dirname, '..')
    const offenders = collectPageFiles(root).filter(file =>
      /redirect\(\s*[`'"]\/login\?next=/.test(readFileSync(file, 'utf8')),
    )

    expect(offenders).toEqual([])
  })
})
