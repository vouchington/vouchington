import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/actionlint.yml', 'utf8')

describe('actionlint workflow', () => {
  it('owns GitHub Actions static analysis for every relevant source and config path', () => {
    expect(workflow).toContain('name: GitHub Actions Static Analysis')
    for (const path of [
      '.github/workflows/**',
      '.github/actions/**',
      '.github/dependabot.yml',
      '.github/actionlint.yaml',
      '.github/actionlint.yml',
      '.github/zizmor.yml',
      '.github/zizmor.yaml',
      '.mise.toml',
    ]) {
      expect(workflow.split(`- '${path}'`)).toHaveLength(3)
    }
  })

  it('runs when mise.toml changes', () => {
    expect(workflow).toContain("- '.mise.toml'")
    expect(workflow).not.toContain("- 'ci/install-actionlint.sh'")
  })

  it('installs actionlint via mise-action with caching disabled', () => {
    expect(workflow).toMatch(/jdx\/mise-action@/)
    expect(workflow).toContain('      - name: Install CI tools via mise')
    expect(workflow).not.toContain('./ci/install-actionlint.sh')
    // actions/cache (mise-action's default) hangs on self-hosted runners — must be disabled.
    expect(workflow).toContain('cache: false')
  })

  it('runs actionlint without ignores', () => {
    expect(workflow.match(/^\s*run: actionlint.*$/gm)).toEqual(['        run: actionlint'])
    expect(workflow).not.toContain('-ignore')
  })

  it('runs the pinned zizmor audit without central ignores', () => {
    expect(workflow).toContain('run: zizmor --offline --min-severity high --min-confidence high .')
    expect(readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')).not.toContain(
      'zizmor --offline',
    )
    expect(readFileSync('.github/zizmor.yml', 'utf8')).not.toMatch(/^\s*ignore:/m)
  })
})
