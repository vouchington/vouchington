import {
  buildOrderedInputCtes,
  normalizeBatchIdentifiers,
  partitionBatchIdentifiers,
  scatterOrderedRows,
  type BatchIdentifierType,
  type NormalizedBatchIdentifier,
  type OrderedInputSqlType,
} from './ordered-identifiers.mts'

export type OrderedBatchPartition<TType extends BatchIdentifierType> = {
  cteName: string
  sqlType: OrderedInputSqlType
  type: TType
}

type OrderedBatchRow = {
  input_order: number
}

type OrderedIdentifierBatchSpec<TResult, TType extends BatchIdentifierType, TOptions> = {
  normalize: (input: string, index: number) => Omit<NormalizedBatchIdentifier<TType>, 'index'>
  partitions: readonly OrderedBatchPartition<TType>[]
  statement: (inputCtes: string) => string
  readRows: (
    sql: string,
    values: unknown[],
    options: TOptions,
  ) => Promise<readonly (TResult & OrderedBatchRow)[]>
}

export async function queryOrderedIdentifierBatch<
  TResult,
  TType extends BatchIdentifierType,
  TOptions,
>(
  identifiers: readonly string[],
  options: TOptions,
  spec: OrderedIdentifierBatchSpec<TResult, TType, TOptions>,
): Promise<Array<TResult | null>> {
  if (identifiers.length === 0) {
    return []
  }

  const normalizedInputs = normalizeBatchIdentifiers(identifiers, spec.normalize)
  const grouped = partitionBatchIdentifiers(normalizedInputs)
  const inputCtes = buildOrderedInputCtes(
    spec.partitions.map(partition => ({
      cteName: partition.cteName,
      sqlType: partition.sqlType,
      inputs: grouped.get(partition.type) ?? [],
    })),
  )
  const rows = await spec.readRows(spec.statement(inputCtes.ctes), inputCtes.values, options)

  return scatterOrderedRows(identifiers.length, rows, row => {
    const { input_order: _inputOrder, ...data } = row
    return data as TResult
  })
}
