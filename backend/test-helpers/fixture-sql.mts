import {
  allowUnannotatedQuery,
  extractLeadingQueryAnnotation,
  type QueryInput,
} from '@vouchington/postgres'
import rawSql, { type SQLStatement } from 'sql-template-strings'

const fixtureQueries = new WeakSet<object>()

/** Fixture SQL may omit a leading annotation. Annotated text keeps its prepared-statement name. */
export function allowFixtureQuery<Input extends QueryInput>(input: Input): Input | SQLStatement {
  const text = typeof input === 'string' ? input : input.text
  if (extractLeadingQueryAnnotation(text)) return input
  if (typeof input !== 'string' && fixtureQueries.has(input)) return input
  const allowed = allowUnannotatedQuery(input)
  fixtureQueries.add(allowed)
  return allowed
}

export default function sql(strings: TemplateStringsArray, ...values: unknown[]): SQLStatement {
  return allowFixtureQuery(rawSql(strings, ...values))
}
