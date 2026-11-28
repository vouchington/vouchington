import { getPaginationLimits } from '@services/pagination'
import { currentUserCanViewUsersSpendingCategories } from '../authorization.mts'
import { getOrCreateIndividual } from '../individuals/individuals.mts'
import { query, type QueryOptions } from '@data-stores/psql'
import {
  buildPageInfo,
  decodeScopedUuidCursor,
  parseBoundedIntegerLimit,
} from '@modules/pagination'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { CurrencyCode, Money } from '@ts-shared/money'
import { parsePostgresMoneyAmount } from '@vouchington/utils/money'
import type { PageInfo } from '@voucha/types/pagination'
type GetHouseholdSpendingCategoriesOptions = QueryOptions & {
  entry_id?: string
  individual_id?: string
  spending_category_topic_id?: string
  after?: string
  limit?: number
}

type SpendingEntryRow = {
  id: string
  spending_category_topic_id: string
  amount_minor_units: string
  currency_code: CurrencyCode
  spending_frequency: 'monthly' | 'annually'
  note: string | null
  owner_type: 'individual' | 'household'
  can_manage: boolean
  spending_category: { id: string; name: string; slug: string }
}

export type HouseholdSpendingCategory = {
  id: string
  spending_category_topic_id: string
  amount: Money
  spending_frequency: 'monthly' | 'annually'
  note: string | null
  owner_type: 'individual' | 'household'
  can_manage: boolean
  spending_category: { id: string; name: string; slug: string }
}

function toSpendingEntry(row: SpendingEntryRow): HouseholdSpendingCategory {
  const { amount_minor_units, currency_code, ...entry } = row
  return {
    ...entry,
    amount: { amount: parsePostgresMoneyAmount(amount_minor_units), currency: currency_code },
  }
}

function spendingCategoryCursorScope(individualId: string): string {
  return `my-spending-categories:${individualId}:id-asc`
}

function appendSpendingEntryFilters(
  statement: ReturnType<typeof sql>,
  filters: { spendingCategoryTopicId?: string; entryId?: string; cursorId: string | null },
): void {
  if (filters.spendingCategoryTopicId) {
    statement.append(sql` AND se.spending_category_topic_id = ${filters.spendingCategoryTopicId}`)
  }
  if (filters.entryId) statement.append(sql` AND se.id = ${filters.entryId}`)
  if (filters.cursorId) statement.append(sql` AND se.id > ${filters.cursorId}`)
}

export async function getHouseholdSpendingCategoriesByUserId(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  options: GetHouseholdSpendingCategoriesOptions = {},
): Promise<{ results: HouseholdSpendingCategory[]; page_info: PageInfo }> {
  assert(currentUser, 401)
  const limit = parseBoundedIntegerLimit(options.limit, { min: 1, ...getPaginationLimits(25, 100) })
  assert(await currentUserCanViewUsersSpendingCategories(currentUser, user.id), 403)
  const individualId = options.individual_id ?? (await getOrCreateIndividual(user)).id
  const scope = spendingCategoryCursorScope(individualId)
  const cursorId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid spending category cursor').id
    : null
  const queryOptions: QueryOptions = {
    readOnly: options.readOnly ?? true,
    client: options.client,
    query: options.query,
  }
  const { rows: accessibleHouseholds } = await query<{ id: string }>(
    sql`
    /* getAccessibleHouseholdsForSpendingCategories */
    SELECT id FROM households WHERE owner_user_id = ${user.id}
    UNION
    SELECT household_id FROM household_members WHERE individual_id = ${individualId}
  `,
    queryOptions,
  )
  const householdIds = accessibleHouseholds.map(household => household.id)
  const entryFilters = {
    spendingCategoryTopicId: options.spending_category_topic_id,
    entryId: options.entry_id,
    cursorId,
  }

  const personalEntries = sql`
    SELECT se.id, se.spending_category_topic_id, se.amount_minor_units, se.currency_code,
      se.spending_frequency, se.note, se.individual_id, se.household_id,
      sc.name AS spending_category_name, sc.slug AS spending_category_slug
    FROM spending_entries se
    JOIN topics sc
      ON sc.id = se.spending_category_topic_id
      AND sc.deleted_at IS NULL AND sc.merged_into_topic_id IS NULL
    WHERE se.individual_id = ${individualId}
  `
  appendSpendingEntryFilters(personalEntries, entryFilters)
  personalEntries.append(sql` ORDER BY se.id ASC LIMIT ${limit + 1}`)

  const householdEntries = sql`
    SELECT hh.id, hh.spending_category_topic_id, hh.amount_minor_units, hh.currency_code,
      hh.spending_frequency, hh.note, hh.individual_id, hh.household_id,
      hh.spending_category_name, hh.spending_category_slug
    FROM UNNEST(${householdIds}::uuid[]) AS accessible_household(household_id)
    CROSS JOIN LATERAL (
      SELECT se.id, se.spending_category_topic_id, se.amount_minor_units, se.currency_code,
        se.spending_frequency, se.note, se.individual_id, se.household_id,
        sc.name AS spending_category_name, sc.slug AS spending_category_slug
      FROM spending_entries se
      JOIN topics sc
        ON sc.id = se.spending_category_topic_id
        AND sc.deleted_at IS NULL AND sc.merged_into_topic_id IS NULL
      WHERE se.household_id = accessible_household.household_id
  `
  appendSpendingEntryFilters(householdEntries, entryFilters)
  householdEntries.append(sql` ORDER BY se.id ASC LIMIT ${limit + 1}
    ) hh`)

  const spendingEntriesQuery = sql`/* getHouseholdSpendingCategoriesByUserId */ WITH visible_entries AS ((`
  spendingEntriesQuery.append(personalEntries)
  spendingEntriesQuery.append(sql`) UNION ALL (`)
  spendingEntriesQuery.append(householdEntries)
  spendingEntriesQuery.append(sql`))
    SELECT
      se.id, se.spending_category_topic_id, se.amount_minor_units::TEXT AS amount_minor_units,
      se.currency_code, se.spending_frequency, se.note,
      CASE WHEN se.individual_id IS NOT NULL THEN 'individual' ELSE 'household' END AS owner_type,
      (
        COALESCE(se.individual_id = ${currentUser.individual_id}, FALSE)
        OR ${currentUser.roles.includes('administrator')}
        OR EXISTS (
          SELECT 1 FROM households owned_household
          WHERE owned_household.id = se.household_id AND owned_household.owner_user_id = ${currentUser.id}
        )
      ) AS can_manage,
      JSON_BUILD_OBJECT('id', se.spending_category_topic_id, 'name', se.spending_category_name, 'slug', se.spending_category_slug) AS spending_category
    FROM visible_entries se
    ORDER BY se.id ASC
    LIMIT ${limit + 1}
  `)

  const { rows } = await query<SpendingEntryRow>(spendingEntriesQuery, queryOptions)
  const results = rows.slice(0, limit).map(toSpendingEntry)
  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: rows.length > limit,
      getCursor: entry => ({ id: entry.id, scope }),
    }),
  }
}

export async function getSpendingEntryOwnership(
  id: string,
): Promise<{ individual_id: string | null; household_id: string | null } | undefined> {
  const { rows } = await query(
    sql`/* getSpendingEntryOwnership */
    SELECT individual_id, household_id FROM spending_entries WHERE id = ${id} LIMIT 1
  `,
    { readOnly: true },
  )
  return rows[0] as { individual_id: string | null; household_id: string | null } | undefined
}
export async function getHouseholdSpendingCategoryById(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  householdSpendingCategoryId: string,
  options: GetHouseholdSpendingCategoriesOptions = {},
): Promise<HouseholdSpendingCategory | undefined> {
  const page = await getHouseholdSpendingCategoriesByUserId(currentUser, user, {
    entry_id: householdSpendingCategoryId,
    limit: 1,
    ...options,
  })
  return page.results[0]
}
