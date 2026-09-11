import { isRecord } from './unknown-record.mts'
import { containsEligibilityPostEquality } from './post-publication-reader-inventory-public-view-ast.mts'

type Aliases = { eligibility: Set<string>; posts: Set<string> }

export function selectProtectsLocalPosts(select: Record<string, unknown>): boolean {
  const aliases = collectSelectAliases(select.fromClause)
  return (
    aliases.posts.size === 0 ||
    (aliases.eligibility.size > 0 &&
      (containsEligibilityPostEquality([select.whereClause], aliases) ||
        filteringJoinContainsEligibilityEquality(select.fromClause, aliases))) ||
    correlatedEligibilitySubqueryComposes(select, aliases.posts)
  )
}

function correlatedEligibilitySubqueryComposes(
  select: Record<string, unknown>,
  outerPostAliases: Set<string>,
): boolean {
  if (outerPostAliases.size === 0) return false
  function containsPositiveEligibilityExists(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(containsPositiveEligibilityExists)
    if (!isRecord(value)) return false
    if (
      isRecord(value.BoolExpr) &&
      (value.BoolExpr.boolop === 'OR_EXPR' || value.BoolExpr.boolop === 'NOT_EXPR')
    ) {
      return false
    }
    if (isRecord(value.A_Expr) || isRecord(value.BooleanTest) || isRecord(value.CaseExpr)) {
      return false
    }
    if (
      isRecord(value.SubLink) &&
      value.SubLink.subLinkType === 'EXISTS_SUBLINK' &&
      isRecord(value.SubLink.subselect) &&
      isRecord(value.SubLink.subselect.SelectStmt)
    ) {
      const nested = value.SubLink.subselect.SelectStmt
      const nestedAliases = collectSelectAliases(nested.fromClause)
      return (
        nestedAliases.eligibility.size > 0 &&
        containsEligibilityPostEquality([nested.fromClause, nested.whereClause], {
          eligibility: nestedAliases.eligibility,
          posts: outerPostAliases,
        })
      )
    }
    return Object.values(value).some(containsPositiveEligibilityExists)
  }
  return containsPositiveEligibilityExists(select.whereClause)
}

function filteringJoinContainsEligibilityEquality(value: unknown, aliases: Aliases): boolean {
  if (Array.isArray(value)) {
    return value.some(item => filteringJoinContainsEligibilityEquality(item, aliases))
  }
  if (!isRecord(value)) return false
  if (isRecord(value.JoinExpr)) {
    if (
      value.JoinExpr.jointype === 'JOIN_INNER' &&
      containsEligibilityPostEquality([value.JoinExpr.quals], aliases)
    ) {
      return true
    }
    return (
      filteringJoinContainsEligibilityEquality(value.JoinExpr.larg, aliases) ||
      filteringJoinContainsEligibilityEquality(value.JoinExpr.rarg, aliases)
    )
  }
  return false
}

function collectSelectAliases(value: unknown): Aliases {
  const aliases: Aliases = { eligibility: new Set<string>(), posts: new Set<string>() }
  function collect(fromClause: unknown): void {
    if (Array.isArray(fromClause)) {
      for (const item of fromClause) collect(item)
      return
    }
    if (!isRecord(fromClause)) return
    if (isRecord(fromClause.RangeVar)) {
      const range = fromClause.RangeVar
      const relationName = range.relname
      if (typeof relationName !== 'string') return
      const alias =
        isRecord(range.alias) && typeof range.alias.aliasname === 'string'
          ? range.alias.aliasname
          : relationName
      if (relationName === 'view_public_post_eligibility') aliases.eligibility.add(alias)
      if (relationName === 'posts') aliases.posts.add(alias)
      return
    }
    if (isRecord(fromClause.JoinExpr)) {
      collect(fromClause.JoinExpr.larg)
      collect(fromClause.JoinExpr.rarg)
    }
  }
  collect(value)
  return aliases
}
