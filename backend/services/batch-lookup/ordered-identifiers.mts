export type BatchIdentifierType = string

export type NormalizedBatchIdentifier<TType extends BatchIdentifierType> = {
  value: string
  type: TType
  index: number
}

export type OrderedInputSqlType = 'text' | 'uuid'

type OrderedInputPartition<TType extends BatchIdentifierType> = {
  cteName: string
  sqlType: OrderedInputSqlType
  inputs: readonly NormalizedBatchIdentifier<TType>[]
}

type OrderedInputCtes = {
  ctes: string
  values: unknown[]
}

type OrderedRow = {
  input_order: number
}

export function normalizeBatchIdentifiers<TType extends BatchIdentifierType>(
  identifiers: readonly string[],
  normalize: (input: string, index: number) => Omit<NormalizedBatchIdentifier<TType>, 'index'>,
): Array<NormalizedBatchIdentifier<TType>> {
  return identifiers.map((input, index) => {
    return {
      ...normalize(input, index),
      index,
    }
  })
}

export function partitionBatchIdentifiers<TType extends BatchIdentifierType>(
  identifiers: readonly NormalizedBatchIdentifier<TType>[],
): Map<TType, Array<NormalizedBatchIdentifier<TType>>> {
  const partitions = new Map<TType, Array<NormalizedBatchIdentifier<TType>>>()

  for (const identifier of identifiers) {
    const partition = partitions.get(identifier.type)
    if (partition) {
      partition.push(identifier)
      continue
    }

    partitions.set(identifier.type, [identifier])
  }

  return partitions
}

export function buildOrderedInputCtes<TType extends BatchIdentifierType>(
  partitions: readonly OrderedInputPartition<TType>[],
): OrderedInputCtes {
  const values: unknown[] = []
  const ctes = partitions.map(partition => {
    const valueParam = values.length + 1
    const orderParam = values.length + 2
    values.push(
      partition.inputs.map(input => input.value),
      partition.inputs.map(input => input.index),
    )

    return `${partition.cteName} AS (
      SELECT unnest($${valueParam}::${partition.sqlType}[]) AS input_value,
             unnest($${orderParam}::int[]) AS input_order
    )`
  })

  return {
    ctes: ctes.join(',\n    '),
    values,
  }
}

export function scatterOrderedRows<TResult, TRow extends OrderedRow>(
  length: number,
  rows: readonly TRow[],
  mapRow: (row: TRow) => TResult,
): Array<TResult | null> {
  const results: Array<TResult | null> = new Array(length).fill(null)

  for (const row of rows) {
    if (!Number.isInteger(row.input_order) || row.input_order < 0 || row.input_order >= length) {
      throw new Error(`Invalid input_order in ordered batch row: ${row.input_order}`)
    }

    results[row.input_order] = mapRow(row)
  }

  return results
}
