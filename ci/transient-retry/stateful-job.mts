const statefulCommandTokens = new Set([
  'apply',
  'deploy',
  'dispatch',
  'migrate',
  'migration',
  'promote',
  'publish',
  'rollback',
])

export function isStatefulCiJob(jobName: string): boolean {
  return jobName
    .toLowerCase()
    .split(/[^a-z]+/)
    .some(token => statefulCommandTokens.has(token))
}
