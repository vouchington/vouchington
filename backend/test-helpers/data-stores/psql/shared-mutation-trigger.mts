import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'

export type SharedMutationProbe =
  | 'eraseActor'
  | 'replaceActor'
  | 'rewriteFact'
  | 'eraseAndRewrite'
  | 'deleteDirectly'
  | 'deleteParent'
  | 'unchanged'

/** Exercise the real shared guard with isolated FK erasure and cascade actions. */
export async function probeSharedMutationTrigger(
  probe: SharedMutationProbe,
  allowActorErasure = true,
): Promise<{
  count: number
  actorErased: boolean
  fact: string | null
}> {
  await using query = await beginTransaction()
  const suffix = randomUUID().replaceAll('-', '')
  const parent = `probe_parent_${suffix}`
  const actors = `probe_actors_${suffix}`
  const ledger = `probe_ledger_${suffix}`
  await query(
    `/* createSharedGuardProbeParent */ CREATE TEMP TABLE ${parent} (id uuid PRIMARY KEY DEFAULT uuidv7()) ON COMMIT DROP`,
  )
  await query(
    `/* createSharedGuardProbeActors */ CREATE TEMP TABLE ${actors} (id uuid PRIMARY KEY DEFAULT uuidv7()) ON COMMIT DROP`,
  )
  await query(`/* createSharedGuardProbeLedger */ CREATE TEMP TABLE ${ledger} (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    parent_id uuid NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES ${actors}(id) ON DELETE SET NULL,
    fact text NOT NULL
  ) ON COMMIT DROP`)
  await query(`/* attachSharedGuardProbe */ CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ${ledger}
    FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation(${allowActorErasure ? "'actor_id'" : ''})`)
  await query(`/* insertSharedGuardProbeParent */ INSERT INTO ${parent} DEFAULT VALUES`)
  await query(`/* insertSharedGuardProbeActor */ INSERT INTO ${actors} DEFAULT VALUES`)
  await query(`/* insertSharedGuardProbeLedger */ INSERT INTO ${ledger}(parent_id, actor_id, fact)
    SELECT parent.id, actor.id, 'original' FROM ${parent} parent CROSS JOIN ${actors} actor`)
  switch (probe) {
    case 'eraseActor':
      await query(`/* eraseSharedGuardProbeActor */ DELETE FROM ${actors}`)
      break
    case 'replaceActor':
      await query(`/* replaceSharedGuardProbeActor */ UPDATE ${ledger} SET actor_id = uuidv7()`)
      break
    case 'rewriteFact':
      await query(`/* rewriteSharedGuardProbeFact */ UPDATE ${ledger} SET fact = 'changed'`)
      break
    case 'eraseAndRewrite':
      await query(
        `/* eraseAndRewriteSharedGuardProbe */ UPDATE ${ledger} SET actor_id = NULL, fact = 'changed'`,
      )
      break
    case 'deleteDirectly':
      await query(`/* deleteSharedGuardProbeDirectly */ DELETE FROM ${ledger}`)
      break
    case 'deleteParent':
      await query(`/* cascadeSharedGuardProbe */ DELETE FROM ${parent}`)
      break
    case 'unchanged':
      await query(`/* leaveSharedGuardProbeUnchanged */ UPDATE ${ledger} SET fact = fact`)
      break
  }
  const { rows } = await query<{ count: number; actor_erased: boolean; fact: string | null }>(
    `/* readSharedGuardProbe */ SELECT count(*)::integer AS count,
      COALESCE(bool_and(actor_id IS NULL), false) AS actor_erased, min(fact) AS fact FROM ${ledger}`,
  )
  await query.rollback()
  return { count: rows[0]!.count, actorErased: rows[0]!.actor_erased, fact: rows[0]!.fact }
}
