import { read, write, query, readPool, beginTransaction } from '@data-stores/psql'
import type { QueryExecutor, QueryInput, QueryValues, QueryMethod } from '@data-stores/psql/types'

type ProbeKind =
  | 'timeout'
  | 'user_request'
  | 'serialization'
  | 'deadlock'
  | 'lock'
  | 'connections'
  | 'division'
  | 'other_cancellation'
export type QueryOperation = 'read' | 'write' | 'query'

function statementFor(kind: ProbeKind): string {
  switch (kind) {
    case 'timeout':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'canceling statement due to statement timeout' USING ERRCODE = '57014'; END $$`
    case 'user_request':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'canceling statement due to user request' USING ERRCODE = '57014'; END $$`
    case 'serialization':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'private synthetic detail' USING ERRCODE = '40001'; END $$`
    case 'deadlock':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'private synthetic detail' USING ERRCODE = '40P01'; END $$`
    case 'lock':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'private synthetic detail' USING ERRCODE = '55P03'; END $$`
    case 'connections':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'private synthetic detail' USING ERRCODE = '53300'; END $$`
    case 'division':
      return '/* guardQueryErrorContext */ SELECT 1 / 0'
    case 'other_cancellation':
      return `/* guardQueryErrorContext */ DO $$ BEGIN RAISE EXCEPTION 'private cancellation detail' USING ERRCODE = '57014'; END $$`
    default:
      throw new Error('Unknown query diagnostic probe')
  }
}

function operationFor(operation: QueryOperation): QueryMethod {
  switch (operation) {
    case 'read':
      return read
    case 'write':
      return write
    case 'query':
      return query
    default:
      throw new Error('Unknown query operation')
  }
}

/** Server-raised classification probes, not an actual deadline, SSI race or exhausted server. */
export async function captureQueryErrorContext(
  kind: ProbeKind,
  operation: QueryOperation = 'read',
) {
  const client = await readPool.connect()
  let original: unknown
  const forward: QueryExecutor = <Row extends Record<string, unknown>>(
    input: QueryInput,
    values?: QueryValues,
  ) =>
    write<Row>(input, values, { client }).catch((err: unknown) => {
      original = err
      throw err
    })
  try {
    await operationFor(operation)(statementFor(kind), [], { query: forward })
    throw new Error('The server error probe unexpectedly completed')
  } catch (err) {
    return { original, observed: err }
  } finally {
    client.release()
  }
}

export async function failQueryErrorContext(operation: QueryOperation | 'transaction') {
  if (operation === 'transaction') {
    await using transaction = await beginTransaction()
    await transaction(statementFor('timeout'))
    await transaction.commit()
    return
  }
  return operationFor(operation)(statementFor('timeout'))
}

export async function queryContextSuccess(operation: QueryOperation) {
  return operationFor(operation)<{ value: number }>(
    '/* guardQueryErrorContext */ SELECT 1 AS value',
  )
}

export async function rejectApplicationQueryError(error: Error) {
  return read('/* guardQueryErrorContext */ SELECT 1', [], {
    query: async () => {
      throw error
    },
  })
}
