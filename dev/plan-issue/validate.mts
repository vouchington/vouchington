import { parseGfmMarkdown } from 'vouchington-tooling/markdown'

import {
  containsNode,
  hasNonApplicableBranch,
  hasSpecificNonApplicable,
  hasStandaloneFiller,
  hasTableHeaders,
  hasVisibleEvidence,
  isResolvedDisposition,
  labeledListFields,
  type MarkdownNode,
  visibleText,
} from './markdown.mts'
import { h2Counts, h2Names, h2Sections } from './heading-sections.mts'
import { isMeaningfulEvidence } from './evidence-values.mts'
import { parseSolvesIdentities, solvesIdentitiesMatch } from './source-identities.mts'
import {
  hasMeaningfulField,
  hasMeaningfulOrderedSteps,
  hasPlausibleMermaidDiagram,
} from './structured-evidence.mts'
import { validatePlanTables } from './table-evidence.mts'
import {
  loadRepositoryCommandCatalog,
  type RepositoryCommandCatalog,
} from './repository-command-catalog.mts'
import { hasCodeCommand } from './verification-command.mts'
import { resolveVerificationCommands } from './verification-command-resolution.mts'
import { githubBodyLengthError } from '../github-body-length.mts'

export { buildPlanIssueCreateArgs } from './create-args.mts'
const DIRECT_USER_REQUEST = 'direct user request; no prior github issue.'
const REQUIRED_H2 = [
  'solves',
  'why',
  'kpis',
  'alternatives analysis',
  'affected files and modules',
  'before and after',
  'implementation plan',
  'affected tests',
  'new tests and scenarios',
  'documentation',
  'verification steps',
  'live browser preflight',
  'planning review',
] as const
const LIVE_BROWSER_STATUSES = new Set(['not-required', 'available', 'exception'])

function headingDisplay(heading: string): string {
  return heading === 'kpis' ? 'KPIs' : heading.replace(/^./, char => char.toUpperCase())
}

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
  const beforeAfter = byName.get('before and after') ?? []
  const beforeAfterHasNonApplicable = hasNonApplicableBranch(beforeAfter)
  const beforeAfterNotApplicable = hasSpecificNonApplicable(beforeAfter)
  const beforeAfterHasArtifacts = containsNode(
    beforeAfter,
    node =>
      node.type === 'table' || (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid'),
  )
  if (
    (beforeAfterHasNonApplicable && !beforeAfterNotApplicable) ||
    (beforeAfterNotApplicable && beforeAfterHasArtifacts) ||
    (!beforeAfterNotApplicable &&
      (!hasPlausibleMermaidDiagram(beforeAfter) ||
        !hasTableHeaders(beforeAfter, ['concern', 'before', 'after'])))
  ) {
    errors.push(
      'Before and after requires a Mermaid diagram and comparison table, or a specific "Not applicable: …" justification.',
    )
  }
  const verification = byName.get('verification steps') ?? []
  if (hasStandaloneFiller(verification))
    errors.push('Verification steps must not include standalone filler.')
  if (!hasCodeCommand(verification))
    errors.push('Verification steps must include a code-formatted command.')
  else {
    try {
      errors.push(
        ...resolveVerificationCommands(verification, catalog ?? loadRepositoryCommandCatalog()),
      )
    } catch (error) {
      errors.push(
        `Verification command catalog failed to load: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  const browser = byName.get('live browser preflight') ?? []
  const browserFields = labeledListFields(browser, ['status', 'surface', 'evidence', 'reason'])
  const status = browserFields.get('status') ?? []
  const hasBrowserField = (name: string) => (browserFields.get(name) ?? []).length > 0
  if (status.length !== 1 || !LIVE_BROWSER_STATUSES.has(status[0]))
    errors.push('Live browser preflight Status must be not-required, available, or exception.')
  else if (status[0] === 'not-required' && ['surface', 'evidence', 'reason'].some(hasBrowserField))
    errors.push(
      'Not-required live browser preflight must not include Surface, Evidence, or Reason.',
    )
  else if (
    status[0] === 'available' &&
    (!hasMeaningfulField(browserFields, 'surface') ||
      !hasMeaningfulField(browserFields, 'evidence') ||
      hasBrowserField('reason'))
  )
    errors.push(
      'Available live browser preflight requires meaningful Surface and Evidence fields and no Reason.',
    )
  else if (
    status[0] === 'exception' &&
    (!hasMeaningfulField(browserFields, 'reason') ||
      hasBrowserField('surface') ||
      hasBrowserField('evidence'))
  )
    errors.push(
      'Live browser preflight exception requires a meaningful Reason and no Surface or Evidence.',
    )
  return errors
}
