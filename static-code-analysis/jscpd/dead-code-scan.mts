import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { rowsFromReport, type BaselineRow } from './dead-code-baseline.mts'

export async function scanDeadCode(
  snapshotRoot: string,
  reportRoot: string,
  binary: string,
): Promise<BaselineRow[]> {
  const args = [
    '--dead-code',
    '--no-gitignore',
    '--config',
    '.jscpd.json',
    '--reporters',
    'json',
    '--output',
    reportRoot,
    '--exit-code',
    '0',
    '.',
  ]
  execFileSync(binary, args, { cwd: snapshotRoot, stdio: 'pipe', maxBuffer: 8 * 1024 * 1024 })
  const report = JSON.parse(
    await readFile(join(reportRoot, 'basta-report.json'), 'utf8'),
  ) as unknown
  return rowsFromReport(report)
}
