import { validatePlanIssue } from './validate-body.mts'
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
export const DIRECT_USER_REQUEST = 'direct user request; no prior github issue.'
export const REQUIRED_H2 = [
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
export const LIVE_BROWSER_STATUSES = new Set(['not-required', 'available', 'exception'])

export function headingDisplay(heading: string): string {
  return heading === 'kpis' ? 'KPIs' : heading.replace(/^./, char => char.toUpperCase())
}

export { validatePlanIssue }
