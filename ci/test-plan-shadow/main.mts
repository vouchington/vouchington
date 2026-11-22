import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseJunit, type JunitFile } from './junit.mts'
import { measure, type PlanJson } from './measure.mts'
import { renderSummary, type ShadowReport } from './report.mts'

type Framework = 'vitest' | 'playwright'

function xmlFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).flatMap(entry =>
    entry.isFile() && entry.name.endsWith('.xml') ? [join(entry.parentPath, entry.name)] : [],
  )
}

function readPlan(path: string): PlanJson | { error: string } {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PlanJson
  } catch (err) {
    return { error: (err as Error).message }
  }
}

function mergeFiles(files: readonly JunitFile[]): JunitFile[] {
  const merged = new Map<string, JunitFile>()
  for (const file of files) {
    const entry = merged.get(file.file) ?? { file: file.file, seconds: 0, failed: false }
    entry.seconds += file.seconds
    entry.failed ||= file.failed
    merged.set(file.file, entry)
  }
  return [...merged.values()]
}

/** Groups downloaded JUnit reports by framework: Playwright artifact names start with playwright. */
function readJunit(dir: string): Record<Framework, JunitFile[]> {
  const grouped: Record<Framework, JunitFile[]> = { vitest: [], playwright: [] }
  for (const path of xmlFiles(dir)) {
    const artifact = path.slice(dir.length + 1)
    // The plan does not cover credentialed Playwright runs or Storybook, so counting them would invent misses.
    if (/credentialed|storybook/.test(artifact)) continue
    const framework = artifact.startsWith('playwright') ? 'playwright' : 'vitest'
    grouped[framework].push(...parseJunit(readFileSync(path, 'utf8')))
  }
  return { vitest: mergeFiles(grouped.vitest), playwright: mergeFiles(grouped.playwright) }
}

export type Settings = {
  junitDir: string
  vitestPlan: string
  playwrightPlan: string
  outDir: string
  summaryFile: string
  run: ShadowReport['run']
}

export function settings(): Settings {
  const value = (raw: string | undefined) => raw ?? ''
  return {
    junitDir: value(process.env.JUNIT_DIR),
    vitestPlan: value(process.env.VITEST_PLAN),
    playwrightPlan: value(process.env.PLAYWRIGHT_PLAN),
    outDir: value(process.env.OUT_DIR),
    summaryFile: value(process.env.GITHUB_STEP_SUMMARY),
    run: {
      id: value(process.env.SOURCE_RUN_ID),
      workflow: value(process.env.SOURCE_WORKFLOW),
      headSha: value(process.env.HEAD_SHA),
      base: value(process.env.BASE_REF),
    },
  }
}

export function buildReport(config: Settings): ShadowReport {
  const junit = readJunit(config.junitDir)
  const frameworks: ShadowReport['frameworks'] = {}
  const plans: Array<[Framework, string]> = [
    ['vitest', config.vitestPlan],
    ['playwright', config.playwrightPlan],
  ]
  for (const [name, planPath] of plans) {
    if (junit[name].length === 0) continue
    const plan = readPlan(planPath)
    frameworks[name] = 'error' in plan ? plan : measure(plan, junit[name])
  }
  return { run: config.run, frameworks }
}

export function main(config: Settings): void {
  mkdirSync(config.outDir, { recursive: true })
  let report: ShadowReport
  try {
    report = buildReport(config)
  } catch (err) {
    const message = (err as Error).message
    report = { run: config.run, frameworks: { report: { error: message } } }
  }
  writeFileSync(
    join(config.outDir, 'test-plan-shadow.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  // Artifacts last one day, so keep one greppable line in the job log for later aggregation.
  process.stdout.write(`test-plan-shadow ${JSON.stringify(report)}\n`)
  const summary = renderSummary(report)
  if (config.summaryFile) appendFileSync(config.summaryFile, summary)
  else process.stdout.write(summary)
}

if (import.meta.main) main(settings())
