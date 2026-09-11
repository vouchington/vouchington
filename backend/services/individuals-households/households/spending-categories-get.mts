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
import { parsePostgresMoneyAmount, type CurrencyCode, type Money } from '@ts-shared/money'
import type { PageInfo } from '@voucha/types/pagination'

type GetHouseholdSpendingCategoriesOptions = QueryOptions & {
  entry_id?: string
  spending_category_id?: string
  after?: string
  limit?: number
}

type SpendingEntryRow = {
  id: string
  spending_category_id: string
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
  spending_category_id: string
  amount: Money
  spending_frequency: 'monthly' | 'annually'
  note: string | null
  owner_type: 'individual' | 'household'
  can_manage: boolean
  spending_category: { id: string; name: string; slug: string }
}

export type HouseholdSpendingCategoryPage = {
  results: HouseholdSpendingCategory[]
  page_info: PageInfo
}

function toSpendingEntry(row: SpendingEntryRow): HouseholdSpendingCategory {
  const { amount_minor_units, currency_code, ...entry } = row
  return {
    ...entry,
    amount: {
      amount: parsePostgresMoneyAmount(amount_minor_units),
      currency: currency_code,
    },
  }
}

function spendingCategoryCursorScope(individualId: string): string {
  return `my-spending-categories:${individualId}:id-asc`
}

export async function getHouseholdSpendingCategoriesByUserId(
  currentUser: PrivateUser | null,
  user: PrivateUser,
  options: GetHouseholdSpendingCategoriesOptions = {},
): Promise<HouseholdSpendingCategoryPage> {
  assert(currentUser, 401)
  assert(await currentUserCanViewUsersSpendingCategories(currentUser, user.id), 403)
  const individual = await getOrCreateIndividual(user)
  const limit = parseBoundedIntegerLimit(options.limit, { default: 25, min: 1, max: 100 })
  const scope = spendingCategoryCursorScope(individual.id)
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
    SELECT h.id
    FROM households h
    LEFT JOIN household_members hm
      ON hm.household_id = h.id AND hm.individual_id = ${individual.id}
    WHERE h.owner_id = ${user.id} OR hm.individual_id IS NOT NULL
  `,
    queryOptions,
  )
  const householdIds = accessibleHouseholds.map(household => household.id)

  const personalEntries = sql`
    SELECT se.*
    FROM spending_entries se
    JOIN view_topics visible_category
      ON visible_category.id = se.spending_category_id
    WHERE se.individual_id = ${individual.id}
  `
  if (options.spending_category_id) {
    personalEntries.append(sql` AND se.spending_category_id = ${options.spending_category_id}`)
  }
  if (options.entry_id) personalEntries.append(sql` AND se.id = ${options.entry_id}`)
  if (cursorId) personalEntries.append(sql` AND se.id > ${cursorId}`)
  personalEntries.append(sql` ORDER BY se.id ASC LIMIT ${limit + 1}`)

  const spendingEntriesQuery = sql`/* getHouseholdSpendingCategoriesByUserId */ WITH visible_entries AS ((`
  spendingEntriesQuery.append(personalEntries)
  spendingEntriesQuery.append(sql`)`)
  if (householdIds.length > 0) {
    for (const householdId of householdIds) {
      const householdEntries = sql`
        SELECT se.*
        FROM spending_entries se
        JOIN view_topics visible_category
          ON visible_category.id = se.spending_category_id
        WHERE se.household_id = ${householdId}
      `
      if (options.spending_category_id) {
        householdEntries.append(sql` AND se.spending_category_id = ${options.spending_category_id}`)
      }
      if (options.entry_id) householdEntries.append(sql` AND se.id = ${options.entry_id}`)
      if (cursorId) householdEntries.append(sql` AND se.id > ${cursorId}`)
      householdEntries.append(sql` ORDER BY se.id ASC LIMIT ${limit + 1}`)
      spendingEntriesQuery.append(sql` UNION ALL (`)
      spendingEntriesQuery.append(householdEntries)
      spendingEntriesQuery.append(sql`)`)
    }
  }
  spendingEntriesQuery.append(sql`)`)
  spendingEntriesQuery.append(sql`
    SELECT
      se.id,
      se.spending_category_id,
      se.amount_minor_units::TEXT AS amount_minor_units,
      se.currency_code,
      se.spending_frequency,
      se.note,
      CASE WHEN se.individual_id IS NOT NULL THEN 'individual' ELSE 'household' END AS owner_type,
      (
        COALESCE(se.individual_id = ${currentUser.individual_id}, FALSE)
        OR ${currentUser.roles.includes('administrator')}
        OR EXISTS (
          SELECT 1 FROM households owned_household
          WHERE owned_household.id = se.household_id AND owned_household.owner_id = ${currentUser.id}
        )
      ) AS can_manage,
      JSON_BUILD_OBJECT('id', sc.id, 'name', sc.name, 'slug', sc.slug) AS spending_category
  `)
  spendingEntriesQuery.append(sql`FROM visible_entries se`)
  spendingEntriesQuery.append(sql`
    JOIN view_topics sc
      ON sc.id = se.spending_category_id
  `)
  spendingEntriesQuery.append(sql` ORDER BY se.id ASC LIMIT ${limit + 1}`)

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
  options: QueryOptions = {},
): Promise<HouseholdSpendingCategory | undefined> {
  const page = await getHouseholdSpendingCategoriesByUserId(currentUser, user, {
    entry_id: householdSpendingCategoryId,
    limit: 1,
    ...options,
  })
  return page.results[0]
}
