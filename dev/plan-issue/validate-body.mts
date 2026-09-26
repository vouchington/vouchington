import { parseGfmMarkdown } from 'vouchington-tooling/markdown'
import {
  hasStandaloneFiller,
  hasVisibleEvidence,
  isResolvedDisposition,
  labeledListFields,
  type MarkdownNode,
  visibleText,
} from './markdown.mts'
import { h2Counts, h2Names, h2Sections } from './heading-sections.mts'
import { isMeaningfulEvidence } from './evidence-values.mts'
import { parseSolvesIdentities, solvesIdentitiesMatch } from './source-identities.mts'
import { hasMeaningfulField, hasMeaningfulOrderedSteps } from './structured-evidence.mts'
import { validatePlanTables } from './table-evidence.mts'
import { type RepositoryCommandCatalog } from './repository-command-catalog.mts'
import { githubBodyLengthError } from '../github-body-length.mts'
import { validatePlanClosingSections } from './validate-body-closing.mts'
import { DIRECT_USER_REQUEST, headingDisplay, REQUIRED_H2 } from './validate.mts'

export function validatePlanIssue(
  title: string,
  body: string,
  targetRepository?: string,
  catalog?: RepositoryCommandCatalog,
): string[] {
  const bodyLengthError = githubBodyLengthError(body)
  if (bodyLengthError) return [bodyLengthError]

  const errors: string[] = []
  const titleSubject = /^Plan:\s*(.*)$/i.exec(title)?.[1] ?? ''
  if (!isMeaningfulEvidence(titleSubject))
    errors.push('Title must start with "Plan:" and include a subject.')
  const root: MarkdownNode = parseGfmMarkdown(body)
  if (hasStandaloneFiller(root.children ?? []))
    errors.push('Plan body must not include standalone filler.')
  const byName = h2Sections(root)
  const counts = h2Counts(root)
  const names = h2Names(root)
  if (
    names.length !== REQUIRED_H2.length ||
    names.some((name, index) => name !== REQUIRED_H2[index])
  )
    errors.push('Plan H2 sections must use the exact required headings in the required order.')
  for (const heading of REQUIRED_H2) {
    if ((counts.get(heading) ?? 0) !== 1)
      errors.push(`Body must include exactly one "## ${headingDisplay(heading)}" section.`)
    else if (heading !== 'verification steps' && !hasVisibleEvidence(byName.get(heading) ?? []))
      errors.push(
        `The "## ${headingDisplay(heading)}" section requires visible, structured evidence.`,
      )
  }
  const why = labeledListFields(byName.get('why') ?? [], ['goal', 'root cause', 'chosen fix'])
  if (!['goal', 'root cause', 'chosen fix'].every(name => hasMeaningfulField(why, name)))
    errors.push('Why must include Goal, Root cause, and Chosen fix.')
  validatePlanTables(errors, byName)
  if (!hasMeaningfulOrderedSteps(byName.get('implementation plan') ?? []))
    errors.push(
      'Implementation plan must include meaningful ordered list steps without placeholders.',
    )
  const review = labeledListFields(byName.get('planning review') ?? [], [
    'independent exploration',
    'independent advisor/reviewer',
    'finding',
    'disposition',
  ])
  if (
    !['independent exploration', 'independent advisor/reviewer', 'finding'].every(name =>
      hasMeaningfulField(review, name),
    ) ||
    (review.get('disposition') ?? []).length === 0
  )
    errors.push(
      'Planning review must include independent exploration, independent advisor/reviewer, finding, and disposition.',
    )
  else if ((review.get('finding') ?? []).length !== (review.get('disposition') ?? []).length)
    errors.push('Planning review must include one Disposition for every Finding.')
  else if (!(review.get('disposition') ?? []).every(isResolvedDisposition))
    errors.push('Every Planning review Disposition must be accepted or rejected with a reason.')
  const solves = byName.get('solves') ?? []
  const solveText = visibleText({ type: 'root', children: solves }, false, true)
  const identities = parseSolvesIdentities(solveText)
  const { references: issues, sources } = identities
  if (issues.length === 0 && solveText.trim().toLowerCase() !== DIRECT_USER_REQUEST)
    errors.push(
      'Solves must include an issue reference or exactly "Direct user request; no prior GitHub issue.".',
    )
  if (issues.length > 0 && sources.length === 0)
    errors.push('Solves must include a full GitHub source URL.')
  if (
    issues.length > 0 &&
    sources.length > 0 &&
    !solvesIdentitiesMatch(identities, targetRepository)
  )
    errors.push('The Solves issue references and GitHub source URLs must identify the same issues.')
  if (issues.length === 0 && sources.length > 0)
    errors.push('A GitHub source URL requires a matching Solves issue reference.')
  validatePlanClosingSections(errors, byName, catalog)
  return errors
}
