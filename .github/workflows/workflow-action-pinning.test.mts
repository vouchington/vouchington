import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

const TEST_ACTION_REF_LITERAL_RE =
  /(?:toContain|toEqual|toBe)\(\s*['"`][^'"`]*(?:uses:(?:\s+|\\s[+*]?))?(?<![@\w.-])[\w.-]+(?:\/[\w.-]+)+@(?:v\d+(?:\.\d+){0,2}|[0-9a-f]{40})\b/g
const TEST_ACTION_REF_REGEX_LITERAL_RE =
  /toMatch\(\s*\/[^/\n]*(?:uses:(?:\s+|\\s[+*]?))?(?<![@\w.-])[\w.-]+(?:\\?\/[\w.-]+)+@(?:v\d+(?:\.\d+){0,2}|[0-9a-f]{40})\b/g

function collectTestFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) return collectTestFiles(path)
    return entry.isFile() && path.endsWith('.test.mts') ? [path] : []
  })
}

function exactActionRefAssertionMatches(content: string): string[] {
  return [
    ...content.matchAll(TEST_ACTION_REF_LITERAL_RE),
    ...content.matchAll(TEST_ACTION_REF_REGEX_LITERAL_RE),
  ].map(match => match[0])
}

describe('action ref pinning', () => {
  it('workflow tests assert action ref pin shape instead of exact versions or hashes', () => {
    const violations: string[] = []

    for (const filePath of [
      ...collectTestFiles('.github/actions'),
      ...collectTestFiles('.github/workflows'),
    ]) {
      const content = readFileSync(filePath, 'utf8')
      for (const match of exactActionRefAssertionMatches(content)) {
        violations.push(`${filePath}: exact action ref assertion: ${match}`)
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('recognizes exact action refs with escaped whitespace and subpaths', () => {
    const contains = ['to', 'Contain'].join('')
    const matches = ['to', 'Match'].join('')
    const exactMajor = `v${Number.parseInt('5', 10)}`
    const exactNextMajor = `v${Number.parseInt('6', 10)}`
    const fullHash = 'a'.repeat(40)

    expect(
      exactActionRefAssertionMatches(`${contains}('uses: actions/cache/restore@${exactMajor}')`),
    ).toHaveLength(1)
    expect(
      exactActionRefAssertionMatches(`${contains}('actions/setup-node@${exactNextMajor}')`),
    ).toHaveLength(1)
    expect(
      exactActionRefAssertionMatches(`${matches}(/uses:\\s+actions\\/checkout@${exactNextMajor}/)`),
    ).toHaveLength(1)
    expect(
      exactActionRefAssertionMatches(
        `${matches}(/uses:\\s+docker\\/build-push-action@${fullHash}/)`,
      ),
    ).toHaveLength(1)
    expect(
      exactActionRefAssertionMatches(`${matches}(/uses:\\s+actions\\/checkout@v\\d+/)`),
    ).toHaveLength(0)
    expect(
      exactActionRefAssertionMatches(`${contains}('installed @scope/package@${exactMajor}')`),
    ).toHaveLength(0)
    expect(
      exactActionRefAssertionMatches(`${contains}('uses: actions/cache@${exactMajor}')`),
    ).toHaveLength(1)
  })
})
