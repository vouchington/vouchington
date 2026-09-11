import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(file: string): string {
  return readFileSync(new URL(file, import.meta.url), 'utf8')
}

describe('vote integrity primary-read routing', () => {
  it('keeps lists replica-eligible and routes exact reconciliation through the primary', () => {
    const serviceSource = source('./get-penalties.mts')
    expect(serviceSource).toContain('await write(sql`/* getVoteWeightPenaltyByIdFromPrimary */')
    expect(serviceSource).toContain('getVoteWeightPenaltiesWithDatabaseRead(options, read)')
    expect(serviceSource).toContain('getVoteWeightPenaltiesWithDatabaseRead(options, write)')
    const routeSource = source('../../api/v1/vote-integrity/penalties.mts')
    expect(routeSource).toContain('await getVoteWeightPenaltiesByFlagIdFromPrimary')
    expect(routeSource).toContain('await getVoteWeightPenaltyByIdFromPrimary(ctx.params.id!)')
  })

  it('keeps flag lists replica-eligible and routes exact flag reads through the primary', () => {
    const serviceSource = source('./get-flags.mts')
    expect(serviceSource).toContain('await write(query)')
    expect(serviceSource).toContain('const { rows } = await read(query)')
    expect(source('../../api/v1/vote-integrity/flags.mts')).toContain(
      'await getVoteIntegrityFlagByIdFromPrimary(ctx.params.id!)',
    )
  })
})
