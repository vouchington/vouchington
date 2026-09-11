import { beforeAll, describe, expect, it } from 'vitest'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import {
  canonicalBuilder,
  inventoryPath,
  makeContext,
} from './post-publication-reader-inventory.test-support.mts'
import { initSqlAst } from './sql-ast.mts'

const publicViewCompositionError = `${inventoryPath}: implemented backend/direct.mts must compose view_public_post_eligibility`

function getPublicViewErrors(direct: string): string[] {
  const errors: string[] = []
  checkPostPublicationReaderInventory(
    makeContext(
      {
        version: 1,
        canonical_builder: canonicalBuilder,
        implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
        pr2_baseline: [],
        classified_exceptions: [],
      },
      { direct },
    ),
    errors,
  )
  return errors
}

describe('post-publication public-view validation', () => {
  beforeAll(() => initSqlAst())

  it('accepts a reader sourced directly from the eligibility view', () => {
    const errors: string[] = []
    checkPostPublicationReaderInventory(
      makeContext(
        {
          version: 1,
          canonical_builder: canonicalBuilder,
          implemented: [{ path: 'backend/direct.mts', classification: 'public-view' }],
          pr2_baseline: [],
          classified_exceptions: [],
        },
        {
          direct: `import { read } from '@data-stores/psql'
const query = sql\`SELECT COUNT(*) FROM view_public_post_eligibility\`
read(query)`,
        },
      ),
      errors,
    )
    expect(errors).toEqual([])
  })

  it('rejects a file with a safe live reader followed by an unsafe live reader', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const safe = sql\`
  SELECT posts.id FROM posts
  JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
\`
const unsafe = sql\`SELECT posts.id FROM posts\`
read(safe)
read(unsafe)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects an eligibility equality weakened by OR TRUE', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT posts.id FROM posts
  JOIN view_public_post_eligibility eligibility
    ON eligibility.post_id = posts.id OR TRUE
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects a negated eligibility equality', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT posts.id FROM posts
  JOIN view_public_post_eligibility eligibility
    ON NOT (eligibility.post_id = posts.id)
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects an unprotected outer post reader beside a protected nested reader', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT outer_post.id
  FROM posts outer_post
  CROSS JOIN (
    SELECT protected_post.id
    FROM posts protected_post
    JOIN view_public_post_eligibility eligibility
      ON eligibility.post_id = protected_post.id
  ) safe_summary
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects an unprotected post reader in a set-operation branch', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT protected_post.id
  FROM posts protected_post
  JOIN view_public_post_eligibility eligibility
    ON eligibility.post_id = protected_post.id
  UNION ALL
  SELECT unsafe_post.id FROM posts unsafe_post
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects an unprotected post reader nested in join conditions', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT protected_post.id
  FROM posts protected_post
  JOIN view_public_post_eligibility eligibility
    ON eligibility.post_id = protected_post.id
   AND EXISTS (SELECT 1 FROM posts unsafe_post)
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects a correlated eligibility check weakened by an outer OR', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  WHERE EXISTS (
    SELECT 1 FROM view_public_post_eligibility eligibility
    WHERE eligibility.post_id = post.id
  ) OR TRUE
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects a negated correlated eligibility check', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  WHERE NOT EXISTS (
    SELECT 1 FROM view_public_post_eligibility eligibility
    WHERE eligibility.post_id = post.id
  )
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects post readers nested in values and distinct expressions', () => {
    const valuesErrors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`VALUES ((SELECT id FROM posts))\`
read(query)`)
    const distinctErrors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT DISTINCT ON ((SELECT id FROM posts LIMIT 1)) eligibility.post_id
  FROM view_public_post_eligibility eligibility
\`
read(query)`)
    expect(valuesErrors).toContain(publicViewCompositionError)
    expect(distinctErrors).toContain(publicViewCompositionError)
  })

  it('rejects a non-filtering left join to eligibility', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  LEFT JOIN view_public_post_eligibility eligibility
    ON eligibility.post_id = post.id
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })

  it('rejects eligibility predicates inverted through boolean wrappers', () => {
    const joinErrors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  JOIN view_public_post_eligibility eligibility
    ON (eligibility.post_id = post.id) IS FALSE
\`
read(query)`)
    const existsErrors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  WHERE EXISTS (
    SELECT 1 FROM view_public_post_eligibility eligibility
    WHERE eligibility.post_id = post.id
  ) = FALSE
\`
read(query)`)
    expect(joinErrors).toContain(publicViewCompositionError)
    expect(existsErrors).toContain(publicViewCompositionError)
  })

  it('rejects eligibility checks neutralized by a case expression', () => {
    const errors = getPublicViewErrors(`import { read } from '@data-stores/psql'
const query = sql\`
  SELECT post.id FROM posts post
  WHERE CASE WHEN EXISTS (
    SELECT 1 FROM view_public_post_eligibility eligibility
    WHERE eligibility.post_id = post.id
  ) THEN TRUE ELSE TRUE END
\`
read(query)`)
    expect(errors).toContain(publicViewCompositionError)
  })
})
