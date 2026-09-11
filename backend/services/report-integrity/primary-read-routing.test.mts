import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('report integrity primary-read routing', () => {
  it('keeps lists replica-eligible and routes exact reconciliation through the primary', () => {
    const serviceSource = source('./get-penalties.mts')
    expect(serviceSource).toContain('await write(sql`/* getReportAbusePenaltyByIdFromPrimary */')
    expect(serviceSource).toContain('const { rows } = await read(query)')
    expect(source('../../api/v1/report-integrity/penalties.mts')).toContain(
      'await getReportAbusePenaltyByIdFromPrimary(id)',
    )
  })

  it('keeps flag lists replica-eligible and routes exact flag reads through the primary', () => {
    const serviceSource = source('./get-flags.mts')
    expect(serviceSource).toContain('await write(sql`/* getReportIntegrityFlagByIdFromPrimary */')
    expect(serviceSource).toContain('const { rows } = await read(query)')
    expect(source('../../api/v1/report-integrity/flags.mts')).toContain(
      'await getReportIntegrityFlagByIdFromPrimary(id)',
    )
  })
})
