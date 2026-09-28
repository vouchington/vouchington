import {
  type MarkdownSectionsDocument,
  parseGfmMarkdown,
  parseMarkdownSections,
  validateMarkdownSections,
  walkMarkdown,
} from 'vouchington-tooling/markdown'

export function extractRelatedIssuesSection(body: string): string | undefined {
  return relatedIssuesSection(parseMarkdownSections(body))
}

export function extractRelatedIssuesReferenceText(body: string): string {
  const section = extractRelatedIssuesSection(body) ?? ''
  const characters = section.split('')
  walkMarkdown(parseGfmMarkdown(section), node => {
    if (node.type !== 'code' && node.type !== 'inlineCode' && node.type !== 'html') return
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return
    for (let offset = start; offset < end; offset++) {
      // Keep visible text on mixed lines, without joining reference syntax across excluded nodes.
      if (characters[offset] !== '\n' && characters[offset] !== '\r') characters[offset] = '\0'
    }
  })
  return characters.join('')
}

export function validatePrDescriptionContent(body: string): {
  errors: string[]
  relatedIssuesSection: string | undefined
} {
  const document = parseMarkdownSections(body)
  const errors = validateMarkdownSections(document, {
    requiredHeadings: ['Summary', 'Impact'],
  }).map(diagnostic => `PR body: ${diagnostic.message} See .agents/skills/pr-description/SKILL.md.`)
  const section = relatedIssuesSection(document)
  if (section === undefined) {
    errors.push(
      'PR body must include a "## Related issues" section (e.g. a heading followed by "Closes #123"). See .agents/skills/agent-workflow/git-and-prs.md.',
    )
  }
  return { errors, relatedIssuesSection: section }
}

function relatedIssuesSection(document: MarkdownSectionsDocument): string | undefined {
  return document.sections.find(section => /^Related\s+issues$/i.test(section.heading))?.content
}
