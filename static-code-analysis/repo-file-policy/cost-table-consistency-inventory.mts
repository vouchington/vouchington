export const CANONICAL_COST_DOCS = [
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-pre-launch-baseline.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-steady-state.md',
  'docs/overview/infrastructure/reference-deployment-costs-per-environment-public-ipv4-subtotal.md',
] as const

export const OLD_COST_DOC = 'docs/overview/infrastructure/deployment-costs.md'

export const COST_SUMMARY_DOCS = new Map([
  ['docs/overview/infrastructure/infrastructure.md', 'deployment-costs.md'],
  ['docs/overview/infrastructure/networking.md', 'deployment-costs.md'],
])

const DEPLOYMENT_COST_LEAF_RE =
  /^docs\/overview\/infrastructure\/reference-deployment-costs-[\w-]+\.md$/
const COST_ANCHOR_FILES = [...CANONICAL_COST_DOCS, OLD_COST_DOC, ...COST_SUMMARY_DOCS.keys()]

export function discoverNoncanonicalDeploymentCostLeaves(
  trackedFiles: readonly string[],
): string[] {
  return trackedFiles
    .filter(
      file =>
        DEPLOYMENT_COST_LEAF_RE.test(file) &&
        !CANONICAL_COST_DOCS.includes(file as (typeof CANONICAL_COST_DOCS)[number]),
    )
    .toSorted()
}

export function hasCostTableGuardAnchor(
  trackedFiles: readonly string[],
  noncanonicalLeaves: readonly string[],
): boolean {
  return (
    noncanonicalLeaves.length > 0 || COST_ANCHOR_FILES.some(file => trackedFiles.includes(file))
  )
}
