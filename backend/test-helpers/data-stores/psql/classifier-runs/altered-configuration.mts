import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  ClassifierRunAdapter,
  ResolvedClassifierRun,
} from '../../../../services/classifier-runs/index.mts'

/** The same resolved run with one more configuration field, so it has a different identity. */
async function withAlteredConfiguration<C>(
  resolved: ResolvedClassifierRun<C>,
): Promise<ResolvedClassifierRun<C>> {
  const altered = JSON.stringify({ ...JSON.parse(resolved.configurationJson), altered: true })
  const { rows } = await write<{ json: string; sha256: Buffer }>(sql`
    /* alterClassifierRunConfiguration */
    SELECT ${altered}::jsonb::text AS json, digest(${altered}::jsonb::text, 'sha256') AS sha256
  `)
  const row = rows[0]
  if (!row) throw new Error('altered classifier configuration was not canonicalized')
  return { ...resolved, configurationJson: row.json, configurationSha256: row.sha256 }
}

/**
 * The adapter whose configuration changes after its first resolution, as a configuration rollout
 * landing while a reservation is in flight. The altered configuration is a valid receipt snapshot.
 */
export function changeConfigurationAfterFirstResolve<C, L, E>(
  adapter: ClassifierRunAdapter<C, L, E>,
): ClassifierRunAdapter<C, L, E> {
  let resolutions = 0
  return {
    ...adapter,
    async resolve(subject, current, query) {
      const resolved = await adapter.resolve(subject, current, query)
      if (!resolved || resolutions++ === 0) return resolved
      return withAlteredConfiguration(resolved)
    },
  }
}
