const MARKER = '`ci/check-scheduled-prompt-index-policy.mts`'

/** Compare the maintained index with tracked prompt documents. */
export function scheduledPromptIndexViolations(
  indexText: string,
  promptPaths: readonly string[],
): string[] {
  const linkedPaths = [...indexText.matchAll(/\]\((scheduled\/[^)\s"]+\.md)\)/g)].map(
    match => `docs/prompts/${match[1]}`,
  )
  const violations: string[] = []
  if (linkedPaths.toSorted().join('\n') !== [...promptPaths].toSorted().join('\n'))
    violations.push('docs/prompts/SCHEDULED.md: index links differ from tracked scheduled prompts')
  if (!indexText.includes(MARKER))
    violations.push(`docs/prompts/SCHEDULED.md: missing static policy marker ${MARKER}`)
  return violations
}
