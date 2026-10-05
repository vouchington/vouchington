import { GENERATED_FINITE_VALUES } from '../finite-values/index.mts'

/** @public Loaded by path by the fixed migration runner; current bootstrap enum definitions. */
export default function createFiniteValueTypes(): string {
  return Object.entries(GENERATED_FINITE_VALUES)
    .map(([name, values]) => {
      const labels = values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ')
      return `-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
DO $$ BEGIN
  CREATE TYPE ${name} AS ENUM (${labels});
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
COMMENT ON TYPE ${name} IS 'Canonical closed values for ${name.replaceAll('_', ' ')}.';`
    })
    .join('\n\n')
}
