import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getFilesFromFolder } from '../../migration-runner/files.mts'
import { splitSqlStatements } from '../../migration-runner/sql-statements.mts'
import { readStartedIfBlocks, type PrecheckFrame } from './ddl-precheck-stack-helpers.mts'
import {
  hasStructuralDdl,
  isAlwaysForbiddenDrop,
  isDestructiveAlterTable,
  isMixedAlterTableStatement,
  isRepairAlterTable,
  isSelectIntoTableCreation,
  isUnclassifiedCreateDdl,
} from './ddl-statement-classifiers.mts'
import { extractDoBlocks, stripDoBlocks } from './do-block-readers.mts'
import { executableSqlStrings } from './generated-ddl-execute-helpers.mts'
import { maskSqlLiterals, stripSqlComments } from './sql-text-scanner-helpers.mts'

export async function loadGeneratedConfigDrivenSql(
  configDrivenDir: string,
): Promise<{ file: string; sql: string }[]> {
  const generatorFiles = getFilesFromFolder(configDrivenDir)
    .filter(file => file.endsWith('.mts'))
    .sort()

  return await Promise.all(
    generatorFiles.map(async file => {
      const mod = (await import(pathToFileURL(join(configDrivenDir, file)).href)) as {
        default?: unknown
      }
      if (typeof mod.default !== 'function') {
        throw new TypeError(`${file} must export a default SQL generator`)
      }
      const sql = await (mod.default as () => unknown)()
      if (typeof sql !== 'string') {
        throw new TypeError(`${file} must generate SQL text`)
      }
      return { file, sql: sql as string }
    }),
  )
}

export function findFirstGeneratedDdlViolation(sql: string): string | null {
  const executableSql = stripSqlComments(sql)
  const blocklessSql = stripDoBlocks(executableSql)
  const topLevelViolation = findFirstStatementViolation(blocklessSql, false)
  if (topLevelViolation) return topLevelViolation

  for (const { body: block } of extractDoBlocks(executableSql)) {
    const bodyViolation = findFirstStatementViolation(stripSqlComments(block), true)
    if (bodyViolation) return bodyViolation
  }

  return null
}

function findFirstStatementViolation(
  sql: string,
  insideDoBlock: boolean,
  initialPrecheckStack: PrecheckFrame[] = [],
): string | null {
  const precheckStack: PrecheckFrame[] = [...initialPrecheckStack]
  for (const statement of splitSqlStatements(sql)) {
    const ddlStatement = maskSqlLiterals(statement)
    if (/^\s*ELS(?:E|IF\b)/is.test(ddlStatement)) {
      precheckStack.pop()
      if (/^\s*ELSE\b/is.test(ddlStatement)) precheckStack.push(null)
    }
    const startedIfBlocks = readStartedIfBlocks(ddlStatement)
    const activePrecheckStack = [...precheckStack, ...startedIfBlocks]
    const hasAnyPrecheck = insideDoBlock && activePrecheckStack.some(Boolean)
    const hasAbsencePrecheck = insideDoBlock && activePrecheckStack.includes('notExists')
    const hasExistencePrecheck = insideDoBlock && activePrecheckStack.includes('exists')

    if (/\bTRUNCATE\b/is.test(ddlStatement)) return 'destructive DDL is not allowed'
    if (isAlwaysForbiddenDrop(ddlStatement)) return 'destructive DDL is not allowed'
    if (/\bDROP\s+INDEX\s+CONCURRENTLY\b/is.test(ddlStatement))
      return 'DROP INDEX CONCURRENTLY is not allowed'
    if (!insideDoBlock && isSelectIntoTableCreation(ddlStatement)) {
      return 'SELECT INTO table creation is not allowed'
    }
    if (
      /\bDROP\b/is.test(ddlStatement) &&
      !/\bIF\s+EXISTS\b/is.test(ddlStatement) &&
      (!insideDoBlock || !hasExistencePrecheck)
    ) {
      return 'destructive DDL is not allowed'
    }
    if (/\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\b/is.test(ddlStatement)) {
      return 'config-driven generators must not emit CREATE VIEW'
    }
    if (/\bCREATE\s+TYPE\b/is.test(ddlStatement) && (!insideDoBlock || !hasAbsencePrecheck)) {
      return 'config-driven generators must not emit CREATE TYPE'
    }
    if (/\bCREATE\s+TRIGGER\b/is.test(ddlStatement) && !hasAbsencePrecheck) {
      return 'CREATE TRIGGER must use a pre-check'
    }
    if (
      /\bCREATE\s+SEQUENCE\b(?!\s+IF\s+NOT\s+EXISTS\b)/is.test(ddlStatement) &&
      !hasAbsencePrecheck
    ) {
      return 'CREATE SEQUENCE must use IF NOT EXISTS'
    }
    if (
      /\bCREATE\s+(?:(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMPORARY|TEMP)\s+|UNLOGGED\s+)?TABLE\b(?!\s+IF\s+NOT\s+EXISTS\b)/is.test(
        ddlStatement,
      ) &&
      !hasAbsencePrecheck
    ) {
      return 'CREATE TABLE must use IF NOT EXISTS'
    }
    if (/\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/is.test(ddlStatement)) {
      return 'config-driven generators must not emit CREATE INDEX CONCURRENTLY'
    }
    if (
      /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?!IF\s+NOT\s+EXISTS\b)/is.test(
        ddlStatement,
      ) &&
      !hasAbsencePrecheck
    ) {
      return 'CREATE INDEX must use IF NOT EXISTS'
    }
    if (isUnclassifiedCreateDdl(ddlStatement)) {
      return 'config-driven generators must not emit unclassified CREATE DDL'
    }
    if (insideDoBlock) {
      const executableViolation = findExecutableStatementViolation(statement, activePrecheckStack)
      if (executableViolation) return executableViolation
      if (
        hasStructuralDdl(ddlStatement) &&
        !hasDoBlockPrecheck(ddlStatement, hasAnyPrecheck, hasAbsencePrecheck, hasExistencePrecheck)
      ) {
        return 'DO blocks with structural DDL must guard each action with a pre-check'
      }
      precheckStack.push(...startedIfBlocks)
      if (/\bEND\s+IF\b/is.test(statement)) precheckStack.pop()
    } else {
      const alterViolation = findTopLevelAlterViolation(ddlStatement)
      if (alterViolation) return alterViolation
    }
  }
  return null
}

function findExecutableStatementViolation(
  statement: string,
  activePrecheckStack: PrecheckFrame[],
): string | null {
  const executableStrings = executableSqlStrings(statement)
  if (!executableStrings) return 'EXECUTE statements must use literal SQL payloads'

  for (const executableString of executableStrings) {
    const stringViolation = findFirstStatementViolation(
      stripSqlComments(executableString),
      true,
      activePrecheckStack,
    )
    if (stringViolation) return stringViolation
  }
  return null
}

function hasDoBlockPrecheck(
  statement: string,
  hasAnyPrecheck: boolean,
  hasAbsencePrecheck: boolean,
  hasExistencePrecheck: boolean,
): boolean {
  if (isMixedAlterTableStatement(statement)) return hasAbsencePrecheck
  if (isDestructiveAlterTable(statement)) {
    return hasExistencePrecheck || /\bIF\s+EXISTS\b/is.test(statement)
  }
  if (isRepairAlterTable(statement) || /\bDROP\b/is.test(statement)) return hasAnyPrecheck
  if (/\bIF\s+NOT\s+EXISTS\b/is.test(statement)) return true
  return hasAbsencePrecheck
}

function findTopLevelAlterViolation(statement: string): string | null {
  if (!/\bALTER\b/is.test(statement)) return null
  if (!/\bALTER\s+TABLE\b/is.test(statement)) {
    return 'config-driven generators must not emit non-table ALTER DDL'
  }
  if (isMixedAlterTableStatement(statement)) {
    return 'ALTER TABLE outside a DO block must only use ADD COLUMN IF NOT EXISTS actions'
  }
  if (
    /\bADD\s+(?:COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)|(?!COLUMN\b|IF\s+NOT\s+EXISTS\b))/is.test(
      statement,
    )
  ) {
    return 'ALTER TABLE ADD COLUMN must use IF NOT EXISTS'
  }
  if (!/\bADD\s+(?:COLUMN\s+)?IF\s+NOT\s+EXISTS\b/is.test(statement)) {
    return 'ALTER TABLE outside a DO block must be guarded'
  }
  return null
}
