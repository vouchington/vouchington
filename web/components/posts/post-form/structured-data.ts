import type { DataPointVertical, StructuredDataState } from '../data-point-fields'

export function getPostStructuredData(input: {
  structuredData: StructuredDataState
  dataPointVertical: DataPointVertical | null
}) {
  const schemaStructuredData =
    input.dataPointVertical === 'bank_account'
      ? Object.fromEntries(
          Object.entries(input.structuredData).filter(
            ([key]) => key !== 'total_credit_limit_all_cards',
          ),
        )
      : input.structuredData
  return {
    ...schemaStructuredData,
    topic_name: undefined,
    vertical: input.dataPointVertical,
    schema_version: 1,
  }
}
