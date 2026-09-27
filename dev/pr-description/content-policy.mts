import { parseMarkdownSections, validateMarkdownSections } from 'vouchington-tooling/markdown'

export function validatePrDescriptionContent(body: string): {
  errors: string[]
  relatedIssuesSection: string | undefined
} {
  const document = parseMarkdownSections(body)
  const errors = validateMarkdownSections(document, {
    requiredHeadings: ['Summary', 'Impact'],
  }).map(diagnostic => `PR body: ${diagnostic.message} See .agents/skills/pr-description/SKILL.md.`)
  const relatedIssuesSection = document.sections.find(section =>
    /^Related\s+issues$/i.test(section.heading),
  )?.content
  if (relatedIssuesSection === undefined) {
    errors.push(
      'PR body must include a "## Related issues" section (e.g. a heading followed by "Closes #123"). See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  }
  return { errors, relatedIssuesSection }
}
