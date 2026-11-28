import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

describe('tracked-only ShellCheck consumer', () => {
  it('pins the same released no-mistakes range in every consuming package', () => {
    const root = JSON.parse(readRepoFile('package.json')) as {
      devDependencies: Record<string, string>
    }
    const ci = JSON.parse(readRepoFile('ci/package.json')) as {
      dependencies: Record<string, string>
    }
    const staticAnalysis = JSON.parse(readRepoFile('static-code-analysis/package.json')) as {
      dependencies: Record<string, string>
    }

    expect(root.devDependencies['no-mistakes']).toMatch(/^\^\d+\.\d+\.\d+$/)
    expect(ci.dependencies['no-mistakes']).toBe(root.devDependencies['no-mistakes'])
    expect(staticAnalysis.dependencies['no-mistakes']).toBe(root.devDependencies['no-mistakes'])
  })
})
