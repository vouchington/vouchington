import { randomBytes } from 'node:crypto'
import {
  beginTransaction,
  read,
  readPool,
  writePool,
  write,
  type PoolClient,
  type TransactionQuery,
} from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

import { observeTestPostgresClientQueries } from './postgres-query-pool-observer.mts'

type Token = { id: string; lookup_digest: string }

export async function readCopyrightThreadRetirementBound(noticeId: string): Promise<string | null> {
  const { rows } = await read<{ retired_before_intake_bound: string }>(sql`
    /* readCopyrightThreadRetirementBound */
    SELECT retired_before_intake_bound
    FROM copyright_notice_email_thread_retirements
    WHERE copyright_notice_id = ${noticeId}`)
  return rows[0]?.retired_before_intake_bound ?? null
}

/** Seed an owned token with its UUIDv7 creation time, leaving source identities untouched. */
export async function seedCopyrightThreadTokenAtForTest(input: {
  createdAt: Date
  intakeId?: string
  lookupDigest?: string
}): Promise<string> {
  const id = uuidv7({ msecs: input.createdAt.getTime() })
  const digest = input.lookupDigest ?? randomBytes(32).toString('hex')
  await write(sql`/* seedCopyrightThreadTokenAtForTest */
    INSERT INTO copyright_notice_email_thread_tokens (id, lookup_digest)
    VALUES (${id}, ${digest})`)
  if (input.intakeId)
    await write(sql`/* seedCopyrightThreadTokenReferenceAtForTest */
      INSERT INTO copyright_notice_email_thread_references (
        copyright_notice_email_intake_id, token_id, reference_kind
      ) VALUES (${input.intakeId}, ${id}, 'message_id')`)
  return id
}

/** Remove an owned orphan at one real query boundary to exercise the GC/ingestion race. */
export async function deleteCopyrightThreadTokenBeforeQueryForTest<T>(
  tokenId: string,
  annotation: string,
  work: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using transaction = await beginTransaction()
  let removed = false
  const query = new Proxy(transaction, {
    apply(target, thisArg, args) {
      const input = args[0] as string | { text: string }
      const text = typeof input === 'string' ? input : input.text
      if (removed || !text.includes(annotation)) return Reflect.apply(target, thisArg, args)
      removed = true
      return (async () => {
        await using deletion = await beginTransaction()
        await deletion(sql`/* deleteCopyrightThreadTokenBeforeQueryForTest:enable */
          SELECT set_config('app.copyright_operational_retention', 'on', true)`)
        await deletion(sql`/* deleteCopyrightThreadTokenBeforeQueryForTest */
          DELETE FROM copyright_notice_email_thread_tokens WHERE id = ${tokenId}`)
        await deletion.commit()
        return Reflect.apply(target, thisArg, args)
      })()
    },
  }) as TransactionQuery
  const result = await work(query)
  if (!removed) throw new Error(`Expected owned query ${annotation}`)
  await transaction.commit()
  return result
}

export async function readCopyrightThreadTokenForIntake(
  intakeId: string,
  kind: 'message_id' | 'matched',
): Promise<Token | null> {
  const statement =
    kind === 'matched'
      ? sql`/* readCopyrightThreadTokenForIntake:matched */
          SELECT token.id, token.lookup_digest
          FROM copyright_notice_email_intake_notice_links link
          JOIN copyright_notice_email_thread_tokens token ON token.id = link.matched_token_id
          WHERE link.copyright_notice_email_intake_id = ${intakeId}`
      : sql`/* readCopyrightThreadTokenForIntake:message */
          SELECT token.id, token.lookup_digest
          FROM copyright_notice_email_thread_references reference
          JOIN copyright_notice_email_thread_tokens token ON token.id = reference.token_id
          WHERE reference.copyright_notice_email_intake_id = ${intakeId}
            AND reference.reference_kind = 'message_id'`
  const { rows } = await read<Token>(statement)
  return rows[0] ?? null
}

export async function readCopyrightThreadTokenById(tokenId: string): Promise<Token | null> {
  const { rows } = await read<Token>(sql`/* readCopyrightThreadTokenById */
    SELECT id, lookup_digest FROM copyright_notice_email_thread_tokens WHERE id = ${tokenId}`)
  return rows[0] ?? null
}

export async function insertCopyrightThreadReferenceWithoutToken(intakeId: string): Promise<void> {
  await write(sql`/* insertCopyrightThreadReferenceWithoutToken */
    INSERT INTO copyright_notice_email_thread_references (
      copyright_notice_email_intake_id, token_id, reference_kind
    ) VALUES (${intakeId}, NULL, 'message_id')`)
}

/** A digest can remain in the dictionary without authorizing a retained graph. */
export async function readCopyrightThreadDigestUsage(digest: string) {
  const { rows } = await read<{ references: number; matched_links: number }>(sql`
    /* readCopyrightThreadDigestUsage */
    SELECT (SELECT count(*)::integer FROM copyright_notice_email_thread_references reference
      WHERE reference.token_id = token.id) AS references,
      (SELECT count(*)::integer FROM copyright_notice_email_intake_notice_links link
        WHERE link.matched_token_id = token.id) AS matched_links
    FROM copyright_notice_email_thread_tokens token WHERE lookup_digest = ${digest}`)
  return rows[0] ?? null
}

/** Exercise reused page checkouts and verify observation leaves subsequent real reads untouched. */
export async function observeCopyrightPageCheckoutRestoration<Result>(
  operation: () => Promise<Result>,
  tokenId: string,
) {
  const originals = [readPool.connect, writePool.connect]
  const clients = new Map<PoolClient, { query: PoolClient['query']; checkouts: number }>()
  const acquired = (client: PoolClient) => {
    const previous = clients.get(client)
    if (previous) previous.checkouts += 1
    else clients.set(client, { query: client.query, checkouts: 1 })
  }
  let callbacks = 0
  readPool.on('acquire', acquired)
  writePool.on('acquire', acquired)
  try {
    const observed = await observeTestPostgresClientQueries(operation, async () => {
      callbacks += 1
    })
    const before = callbacks
    const token = await readCopyrightThreadTokenById(tokenId)
    return {
      result: observed.result,
      scans: observed.queries.filter(query =>
        query.text.includes('/* scanCopyrightOperationalRetentionPage */'),
      ).length,
      reused: [...clients.values()].some(client => client.checkouts > 1),
      restored:
        readPool.connect === originals[0] &&
        writePool.connect === originals[1] &&
        [...clients].every(([client, original]) => client.query === original.query),
      callbacksAfterTeardown: callbacks - before,
      token,
    }
  } finally {
    readPool.off('acquire', acquired)
    writePool.off('acquire', acquired)
  }
}
