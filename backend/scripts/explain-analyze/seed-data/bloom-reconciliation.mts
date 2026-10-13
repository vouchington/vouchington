import { insertExplainBloomRepairSources } from '@voucha/test-helpers/entities/explain-bloom-repair'
import { resolveSeedAnchor } from './seed-anchor.mts'
import { seedUuid } from './common.mts'

export function bloomRepairSeedWindow() {
  const recent = new Date(
    resolveSeedAnchor(process.env.EXPLAIN_SEED_ANCHOR_DATE).dayAnchorMs - 86_400_000,
  )
  return { start: new Date(recent.getTime() - 1000), end: new Date(recent.getTime() + 1000) }
}

export async function seedBloomReconciliation(): Promise<void> {
  const { start } = bloomRepairSeedWindow()
  const recent = new Date(start.getTime() + 1000)
  const old = new Date(recent.getTime() - 90 * 86_400_000)
  const rows = Array.from({ length: 256 }, (_, ordinal) => ({
    id: seedUuid(50_000 + ordinal, '14'),
    apiKeyId: seedUuid(50_000 + ordinal, '35'),
    aliasId: seedUuid(50_000 + ordinal, '36'),
    key: `seed-bloom-repair-${ordinal}`,
    updated_at: ordinal < 4 ? recent.toISOString() : old.toISOString(),
  }))
  await insertExplainBloomRepairSources(rows, {
    userId: seedUuid(0, '01'),
    postId: seedUuid(0, '05'),
    hostnameId: seedUuid(0, '02'),
    urlId: seedUuid(0, '03'),
  })
}
