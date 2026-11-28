import { GENERATED_FINITE_VALUES } from '../finite-values/index.mts'

/* v8 ignore start -- loaded by path by the fixed migration runner; verified by db:migrate and schema-finite-enums.test.mts (backend-postgres-schema runs without --coverage). */
/** Loaded by path by the fixed migration runner; current bootstrap enum definitions. */
export default function createFiniteValueTypes(): string {
  return Object.entries(GENERATED_FINITE_VALUES)
    .map(([name, values]) => {
      const labels = values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ')
      return `DO $$ BEGIN
  CREATE TYPE ${name} AS ENUM (${labels});
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON TYPE ${name} IS 'Canonical closed values for ${name.replaceAll('_', ' ')}.';`
    })
    .join('\n\n')
}
/* v8 ignore stop */
