export type WorkflowTestFile = {
  path: string
  text: string
}

const TEST_ACTION_REF_LITERAL_RE =
  /(?:toContain|toEqual|toBe)\(\s*['"`][^'"`]*(?:uses:(?:\s+|\\s[+*]?))?(?<![@\w.-])[\w.-]+(?:\/[\w.-]+)+@(?:v\d+(?:\.\d+){0,2}|[0-9a-f]{40})\b/g
const TEST_ACTION_REF_REGEX_LITERAL_RE =
  /toMatch\(\s*\/[^/\n]*(?:uses:(?:\s+|\\s[+*]?))?(?<![@\w.-])[\w.-]+(?:\\?\/[\w.-]+)+@(?:v\d+(?:\.\d+){0,2}|[0-9a-f]{40})\b/g

function exactActionRefAssertionMatches(content: string): string[] {
  return [
    ...content.matchAll(TEST_ACTION_REF_LITERAL_RE),
    ...content.matchAll(TEST_ACTION_REF_REGEX_LITERAL_RE),
  ].map(match => match[0])
}

export function workflowTestActionRefViolations(files: readonly WorkflowTestFile[]): string[] {
  const violations: string[] = []
  for (const file of files) {
    for (const match of exactActionRefAssertionMatches(file.text)) {
      violations.push(`${file.path}: exact action ref assertion: ${match}`)
    }
  }
  return violations
}
