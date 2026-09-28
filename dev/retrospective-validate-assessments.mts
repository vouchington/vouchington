// Current retrospective producers require an explicit assessment even when nothing was inspected.
export function validateAssessmentSections(lines: string[]): string[] {
  const errors: string[] = []
  for (const title of ['Tool Findings', 'Architecture Findings']) {
    const header = `## ${title}`
    const positions = lines.flatMap((line, index) => (line === header ? [index] : []))
    if (positions.length !== 1) {
      errors.push(`${header} must appear exactly once`)
      continue
    }
    const start = positions[0]! + 1
    const next = lines.findIndex((line, index) => index >= start && /^## /.test(line))
    const section = lines.slice(start, next < 0 ? undefined : next)
    const statuses = section.filter(line => line.startsWith('Status: '))
    if (statuses.length !== 1) {
      errors.push(`${header} requires exactly one assessment status`)
      continue
    }
    const status = statuses[0]!
    if (Buffer.byteLength(status) > 320) {
      errors.push(`${header} assessment status must be bounded`)
      continue
    }
    if (/^Status: (?:none observed|not assessed|unavailable) \(.*\S.*\)$/.test(status)) {
      if (section.some(line => /^- /.test(line)))
        errors.push(`${header} findings contradict its assessment status`)
      continue
    }
    if (!/^Status: findings(?: \(.*\S.*\))?$/.test(status)) {
      errors.push(`${header} requires findings or an explicit non-finding status with a reason`)
      continue
    }
    const observations = section.flatMap((line, index) => (/^- .+\S$/.test(line) ? [index] : []))
    if (observations.length === 0) {
      errors.push(`${header} findings status requires an observation`)
      continue
    }
    for (const [index, position] of observations.entries()) {
      const group = section.slice(position + 1, observations[index + 1])
      if (
        !group.some(line => /^ {2}- Evidence: .*\S$/.test(line)) ||
        !group.some(line => /^ {2}- Disposition: .*\S$/.test(line))
      )
        errors.push(`${header} observations require evidence and disposition`)
    }
  }
  return errors
}
