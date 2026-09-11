import type { OpenApiDocument, OpenApiSchema } from 'vouchington-tooling/openapi-document'
import { MAX_MONEY_AMOUNT, MAX_POINT_VALUE_MICROUNITS } from '@ts-shared/money'

function applyMoneyAmountContract(schema: OpenApiSchema, propertyName?: string): void {
  if (
    schema.type === 'object' &&
    schema.properties?.amount &&
    schema.properties.currency &&
    schema.required?.includes('amount') &&
    schema.required.includes('currency')
  ) {
    schema.additionalProperties = false
    const isScaledAggregate =
      schema.properties.amount.type === 'string' &&
      schema.required.includes('scale') &&
      schema.properties.scale?.const === 6
    schema.properties.amount = isScaledAggregate
      ? { type: 'string', pattern: '^(0|[1-9][0-9]*)$' }
      : {
          type: 'integer',
          minimum: 0,
          maximum:
            propertyName === 'value_per_point' ? MAX_POINT_VALUE_MICROUNITS : MAX_MONEY_AMOUNT,
        }
  }
  for (const [name, child] of Object.entries(schema.properties ?? {})) {
    applyMoneyAmountContract(child, name)
  }
  if (schema.items) applyMoneyAmountContract(schema.items, propertyName)
  for (const child of schema.anyOf ?? []) applyMoneyAmountContract(child, propertyName)
  for (const child of schema.allOf ?? []) applyMoneyAmountContract(child, propertyName)
}

export function applyMoneyContracts(document: OpenApiDocument): void {
  for (const schema of Object.values(document.components.schemas)) {
    applyMoneyAmountContract(schema)
  }
  for (const operations of Object.values(document.paths)) {
    for (const operation of Object.values(operations)) {
      const requestSchema = operation.requestBody?.content['application/json'].schema
      if (requestSchema) applyMoneyAmountContract(requestSchema)
      for (const response of Object.values(operation.responses)) {
        if ('$ref' in response) continue
        for (const content of Object.values(response.content ?? {})) {
          applyMoneyAmountContract(content.schema)
        }
      }
    }
  }
}
