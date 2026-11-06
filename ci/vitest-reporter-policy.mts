import { parse } from 'yaml'

type Step = {
  name?: string
  env?: Record<string, unknown>
  run?: string
  if?: string
  'continue-on-error'?: boolean
  'timeout-minutes'?: number
  uses?: string
  with?: Record<string, unknown>
}
type Workflow = { jobs?: Record<string, { steps?: Step[] }> }

const jobs = [
  ['tests-web.yml', 'web-tests', 'Run web tests', 'web-test-report-shard-${{ matrix.shard }}'],
  [
    'tests-backend-modules.yml',
    'backend-modules',
    'Run backend module tests',
    'backend-modules-junit',
  ],
  ['tests-tooling.yml', 'tooling', 'Run tooling tests', 'tooling-junit'],
  ['tests-ts-shared.yml', 'ts-shared', 'Run ts-shared tests', 'ts-shared-junit'],
] as const

export function vitestReporterPolicyViolations(
  sources: Readonly<Record<string, string>>,
): string[] {
  const errors: string[] = []
  const workflows = new Map<string, Workflow>()
  for (const [file, source] of Object.entries(sources)) {
    try {
      workflows.set(file, parse(source) as Workflow)
    } catch {
      errors.push(`${file}: invalid YAML`)
    }
  }
  for (const [file, job, runName, artifactName] of jobs) {
    const path = `.github/workflows/${file}`
    const steps = workflows.get(path)?.jobs?.[job]?.steps ?? []
    const index = steps.findIndex(step => step.name === runName)
    const output = steps[index]?.env?.VITEST_JUNIT_OUTPUT_FILE
    const uploads = steps.filter(
      step => step.uses?.startsWith('actions/upload-artifact@') && step.with?.path === output,
    )
    const upload = uploads[0]
    if (
      index < 0 ||
      typeof output !== 'string' ||
      !/\.junit\.xml$/.test(output) ||
      uploads.length !== 1 ||
      steps.indexOf(upload) !== index + 1 ||
      upload?.if !== '${{ !cancelled() }}' ||
      upload['continue-on-error'] !== true ||
      !/^actions\/upload-artifact@[0-9a-f]{40}$/.test(upload.uses ?? '') ||
      upload.with?.name !== artifactName ||
      upload.with?.path !== output ||
      upload.with?.['retention-days'] !== 1 ||
      upload.with?.['if-no-files-found'] !== 'warn' ||
      typeof upload['timeout-minutes'] !== 'number' ||
      upload['timeout-minutes'] <= 0
    )
      errors.push(`${path}: ${job} JUnit upload policy`)
  }
  const commands: { path: string; line: string; env: Record<string, unknown> }[] = []
  for (const [path, workflow] of workflows)
    for (const job of Object.values(workflow?.jobs ?? {}))
      for (const step of job.steps ?? [])
        for (const line of (step.run ?? '').split('\n')) {
          if (
            line.includes('vitest run') ||
            line.includes('ci/tooling-test-runner.mts') ||
            line.includes('vouchington storybook-browser-runner') ||
            /pnpm run test:[^\s]+/.test(line)
          )
            commands.push({ path, line: line.trim(), env: step.env ?? {} })
        }
  if (!commands.length) errors.push('No workflow Vitest commands found')
  for (const { path, line } of commands)
    if (!line.includes('--bail=3')) errors.push(`${path}: command missing --bail=3: ${line}`)
  const route = commands.filter(({ line }) => line.includes('--project i18n-route-bounds'))
  if (
    route.length !== 1 ||
    route[0]?.path !== '.github/workflows/tests-tooling.yml' ||
    route[0]?.line !==
      'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project i18n-route-bounds' ||
    Object.keys(route[0]?.env ?? {}).length !== 1 ||
    route[0]?.env.VITEST_CI_REPORTERS !== 'run'
  )
    errors.push('i18n-route-bounds command or environment differs')
  for (const { path, line, env } of commands.filter(
    ({ line }) => !line.includes('--project i18n-route-bounds'),
  )) {
    if (
      line.includes('--reporter=') ||
      line.includes('--outputFile=') ||
      env.VITEST_CI_REPORTERS !== 'run' ||
      typeof env.VITEST_JUNIT_OUTPUT_FILE !== 'string' ||
      !/\S+\.junit\.xml/.test(env.VITEST_JUNIT_OUTPUT_FILE) ||
      'VITEST_BLOB_OUTPUT_FILE' in env
    )
      errors.push(`${path}: reporter configuration: ${line}`)
  }
  return errors
}
