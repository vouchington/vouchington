import {
  containsNode,
  hasNonApplicableBranch,
  hasRequiredAlternativeClasses,
  type MarkdownNode,
  visibleText,
} from './markdown.mts'
import {
  parseAlternativeDecision,
  type AlternativeDecisionOutcome,
} from './alternative-decision.mts'
import { requireTable } from './structured-evidence.mts'

function tableRowCells(nodes: MarkdownNode[], headers: string[]): MarkdownNode[][] {
  const tables: MarkdownNode[] = []
  containsNode(nodes, node => {
    if (node.type === 'table') tables.push(node)
    return false
  })
  if (tables.length !== 1) return []
  const rows = tables[0].children ?? []
  const actualHeaders = (rows[0]?.children ?? []).map(cell =>
    visibleText(cell).trim().toLowerCase(),
  )
  const indexes = headers.map(header => actualHeaders.indexOf(header))
  if (indexes.some(index => index < 0)) return []
  return rows.slice(1).map(row => indexes.map(index => row.children?.[index] ?? { type: 'root' }))
}

function tableRows(nodes: MarkdownNode[], headers: string[]): string[][] {
  return tableRowCells(nodes, headers).map(row => row.map(cell => visibleText(cell).trim()))
}

interface AlternativeDecision {
  alternative: string
  outcome: AlternativeDecisionOutcome | null
}

function hasChosenNoChange(decisions: AlternativeDecision[]): boolean {
  return decisions.some(
    ({ alternative, outcome }) =>
      /^no[- ]change\b/i.test(alternative) && (outcome === 'chosen' || outcome === 'accepted'),
  )
}

function hasExistingOrNewClassifications(nodes: MarkdownNode[]): boolean {
  const classifications = tableRows(nodes, ['existing or new']).flat()
  return (
    classifications.length > 0 &&
    classifications.every(value => /^(?:existing|new)(?:$|(?:[:;—-]\s+|\s+\()\S)/i.test(value))
  )
}

export function validatePlanTables(errors: string[], byName: Map<string, MarkdownNode[]>): void {
  requireTable(errors, byName, 'kpis', ['kpi', 'target', 'measurement'])
  requireTable(
    errors,
    byName,
    'alternatives analysis',
    ['alternative', 'benefits', 'costs or risks', 'decision reason'],
    false,
    [],
    ['decision reason'],
  )
  const alternatives = byName.get('alternatives analysis') ?? []
  if (!hasRequiredAlternativeClasses(alternatives))
    errors.push(
      'Alternatives analysis must compare No change, Reuse, and Materially different approaches.',
    )
  const decisions = tableRowCells(alternatives, ['alternative', 'decision reason']).map(
    ([alternative, decision]) => ({
      alternative: visibleText(alternative).trim(),
      outcome: parseAlternativeDecision(decision),
    }),
  )
  if (
    !decisions.every(({ outcome }) => outcome !== null) ||
    decisions.filter(({ outcome }) => outcome === 'chosen' || outcome === 'accepted').length !== 1
  )
    errors.push(
      'Every alternative Decision reason must be resolved with a rationale, with exactly one Chosen or Accepted.',
    )

  const affectedFiles = byName.get('affected files and modules') ?? []
  requireTable(
    errors,
    byName,
    'affected files and modules',
    ['path or module', 'existing or new', 'role and change', 'dependencies', 'dependents'],
    true,
    ['dependencies', 'dependents'],
  )
  if (hasNonApplicableBranch(affectedFiles) && !hasChosenNoChange(decisions))
    errors.push(
      'Affected files may be Not applicable only when No change is the chosen alternative.',
    )
  if (
    containsNode(affectedFiles, node => node.type === 'table') &&
    !hasExistingOrNewClassifications(affectedFiles)
  )
    errors.push('Affected files and modules must classify every row as Existing or New.')

  const affectedTests = byName.get('affected tests') ?? []
  requireTable(
    errors,
    byName,
    'affected tests',
    ['test', 'existing or new', 'why affected', 'behavior to check before implementation'],
    true,
  )
  if (
    containsNode(affectedTests, node => node.type === 'table') &&
    !hasExistingOrNewClassifications(affectedTests)
  )
    errors.push('Affected tests must classify every row as Existing or New.')
  requireTable(
    errors,
    byName,
    'new tests and scenarios',
    ['scenario', 'setup', 'expected outcome'],
    true,
  )
  requireTable(errors, byName, 'documentation', ['document', 'update'], true)
}
