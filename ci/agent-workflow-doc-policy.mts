export function hasPrShepherdDeadlineRegression(paragraph: string): boolean {
  return (
    /\bpr-shepherd\b/u.test(paragraph) && /\b(?:one-hour|session[ -]deadline)\b/iu.test(paragraph)
  )
}

export function agentWorkflowDocViolations(
  paths: readonly string[],
  readSource: (path: string) => string,
): string[] {
  const violations: string[] = []
  if (!paths.includes('web/AGENTS.md')) {
    violations.push('web/AGENTS.md is missing from tracked Markdown')
  }

  for (const path of paths) {
    const source = readSource(path)
    for (const [index, paragraph] of source.split(/\n\s*\n/u).entries()) {
      if (hasPrShepherdDeadlineRegression(paragraph)) {
        violations.push(`${path}:paragraph-${index + 1}: pr-shepherd session deadline`)
      }
    }
    if (source.includes('pr:attach-screenshots -- ')) {
      violations.push(`${path}: pnpm separator for screenshot CLI`)
    }
  }

  return violations
}
