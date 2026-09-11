const CI_CONTROL_FILTERS = new Set([
  '.github/ci-path-filters.yml',
  '.github/ci-runtime-path-filters.yml',
])
const CI_CONTROL_WORKFLOW = /^\.github\/workflows\/ci(?:-[^/]+)?\.ya?ml$/u
const CI_CONTROL_ACTION_PREFIX = '.github/actions/ci-'

export function isCiControlSurface(path: string): boolean {
  return (
    CI_CONTROL_FILTERS.has(path) ||
    CI_CONTROL_WORKFLOW.test(path) ||
    path.startsWith(CI_CONTROL_ACTION_PREFIX)
  )
}
