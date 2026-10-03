import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import {
  formatClassifierUsageReport,
  parseClassifierUsageTime,
  readClassifierUsageReport,
} from '@services/classifier-runs'
import onError from '@modules/on-error'
import { parseArgs } from 'node:util'

const USAGE = `Usage: node backend/scripts/classifier-call-efficiency.mts --from <UTC time> [--to <UTC time>] [--json]

Reports the D3 call-efficiency KPI for every fixed classifier over the runs reserved in the window:
billed provider calls per content version and receipt, retries, re-classifications, cost and
latency. Read-only. Times are UTC ISO times such as 2026-10-01T00:00:00Z. --to defaults to now, and
a window that still holds unfinished runs reports an inconclusive verdict until they settle.
--json prints the whole report, one row per run included.`

function parseTime(name: string, value: string): Date {
  const time = parseClassifierUsageTime(value)
  if (time === null) {
    throw new Error(`--${name} must be a UTC ISO time like 2026-10-01T00:00:00Z, got "${value}"`)
  }
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
    await shutdownDataStoresForOneOffCommand()
  }
}

main().catch(err => {
  onError(err)
  process.exitCode = 1
})
