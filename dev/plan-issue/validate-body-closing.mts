import {
  containsNode,
  hasNonApplicableBranch,
  hasSpecificNonApplicable,
  hasStandaloneFiller,
  hasTableHeaders,
  labeledListFields,
  type MarkdownNode,
} from './markdown.mts'
import { hasMeaningfulField, hasPlausibleMermaidDiagram } from './structured-evidence.mts'
import { hasCodeCommand } from './verification-command.mts'
import { resolveVerificationCommands } from './verification-command-resolution.mts'
import {
  loadRepositoryCommandCatalog,
  type RepositoryCommandCatalog,
} from './repository-command-catalog.mts'
import { LIVE_BROWSER_STATUSES } from './validate.mts'

export function validatePlanClosingSections(
  errors: string[],
  byName: Map<string, MarkdownNode[]>,
  catalog: RepositoryCommandCatalog | undefined,
): void {
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
}
