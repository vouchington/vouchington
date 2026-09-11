import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lazyImportExpectations, type LazyImportExpectation } from '../auth-gated-code-splitting'

function readFile(file: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
}

function assertLazyImport({ file, modulePath, exportName }: LazyImportExpectation) {
  const contents = readFile(file)
  const escapedPath = RegExp.escape(modulePath)

  expect(contents).not.toMatch(new RegExp(`from\\s+['"]${escapedPath}['"]`))
  expect(contents).toMatch(new RegExp(String.raw`import\s*\(\s*['"]${escapedPath}['"]\s*\)`))

  if (!exportName) return

  expect(contents).toMatch(
    new RegExp(String.raw`import\s*\(\s*['"]${escapedPath}['"]\s*\)\s*\.then\s*\(`), // Test-fixture path, not user input.
  )
  expect(contents).toContain(`.${exportName}`)
}

describe('auth-gated code splitting', () => {
  it('keeps logged-in and admin-only UI behind dynamic imports', () => {
    for (const expectation of lazyImportExpectations) {
      assertLazyImport(expectation)
    }
  })
})
