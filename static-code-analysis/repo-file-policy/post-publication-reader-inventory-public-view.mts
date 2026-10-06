import { composesPublicEligibilityView as composesView } from 'vouchington-tooling/post-publication-inventory'
import { SQL_TEMPLATE_OPTIONS } from './post-publication-reader-inventory-config.mts'

export function composesPublicEligibilityView(content: string): boolean {
  return composesView(content, {
    sql: SQL_TEMPLATE_OPTIONS,
    sourceRelation: 'posts',
    eligibilityRelation: 'view_public_post_eligibility',
    sourceIdColumn: 'id',
    eligibilityIdColumn: 'post_id',
  })
}
