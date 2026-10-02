import { onGracefulShutdown } from '@data-stores/psql'
import { formatClassifierUsageReport, readClassifierUsageReport } from '@services/classifier-runs'
import onError from '@modules/on-error'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node backend/scripts/classifier-call-efficiency.mts --from <ISO time> [--to <ISO time>] [--json]

Reports the D3 call-efficiency KPI for every fixed classifier over the runs reserved in the window:
billed provider calls per content version and receipt, retries, re-classifications, cost and
latency. Read-only. --to defaults to now. --json prints the whole report, one row per run included.`

function parseTime(name: string, value: string): Date {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) throw new Error(`--${name} must be an ISO time, got "${value}"`)
  return time
}

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      json: { default: false, type: 'boolean' },
    },
  })
  if (values.from === undefined) throw new Error(`--from is required\n\n${USAGE}`)
  try {
    const window = {
      from: parseTime('from', values.from),
      to: values.to === undefined ? new Date() : parseTime('to', values.to),
    }
    const report = await readClassifierUsageReport(window)
    console.log(values.json ? JSON.stringify(report, null, 2) : formatClassifierUsageReport(report))
  } finally {
    await onGracefulShutdown()
  }
}

main().catch(err => {
  onError(err)
  process.exitCode = 1
})
