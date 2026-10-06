import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'

export const RETAINED_RELATION_GROWTH_POLICIES = entityRelationMetadatum.flatMap(metadata =>
  metadata.election
    ? ([
        [
          `retained_${metadata.table_name}`,
          'Optional retained relation tuples exist only while deletion impacts pin them; composite subject/id lookups and bounded impact-aware cleanup remain index-selective.',
        ],
      ] as const)
    : [],
)
