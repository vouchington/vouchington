import type { Measurement } from './measure.mts'

export type ShadowReport = {
  run: { id: string; workflow: string; headSha: string; base: string }
  frameworks: Record<string, Measurement | { error: string }>
}

const minutes = (seconds: number) => (seconds / 60).toFixed(1)

export function renderSummary(report: ShadowReport): string {
  const { run } = report
  const lines = [
    '## Test plan shadow',
    '',
    `Shadow only: ${run.workflow} ran its full suites. Plan: \`pullRequest\` environment, \`origin/${run.base}...${run.headSha.slice(0, 10)}\`.`,
    '',
    '| Framework | Planned / total files | Est. job-min saved | Misses |',
    '| --- | --- | --- | --- |',
  ]
  for (const [name, value] of Object.entries(report.frameworks)) {
    if ('error' in value) {
      lines.push(`| ${name} | plan failed: ${value.error} | | |`)
      continue
    }
    const note = value.fallback ? ' (full-suite fallback)' : ''
    lines.push(
      `| ${name} | ${value.plannedFiles} / ${value.totalFiles}${note} | ${minutes(value.savedSeconds)} of ${minutes(value.totalSeconds)} | ${value.misses.length} |`,
    )
  }
  for (const [name, value] of Object.entries(report.frameworks)) {
    if ('error' in value || value.misses.length === 0) continue
    lines.push('', `**${name} misses** (failed in the full run, not planned):`)
    for (const file of value.misses) lines.push(`- \`${file}\``)
  }
  return `${lines.join('\n')}\n`
}
