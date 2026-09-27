import path from 'node:path'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { getFilesFromFolder, readMigrationFile } from './files.mts'
import { splitSqlStatements } from './sql-statements.mts'
import {
  buildDropViewStatement,
  extractViewDeclarations,
  type ManagedViewDeclaration,
} from './view-sql.mts'

const isTest = process.env.NODE_ENV === 'test'

export type ViewLogger = { error: typeof console.error; log: typeof console.log }

const silentLogger: ViewLogger = { error: () => {}, log: () => {} }

type PendingViewStatement = { sql: string; view: string }
type AttemptedView = { pendingView: PendingViewStatement; success: boolean }
export {
  buildDropViewStatement,
  extractViewDeclarations,
  extractViewNames,
  type ManagedViewDeclaration,
} from './view-sql.mts'

export interface RunViewsOptions {
  forced?: boolean
  folder?: string
  logger?: ViewLogger
  writer?: QueryExecutor
}

export async function runViews(rootDir: string, options: RunViewsOptions = {}) {
  const viewsFolder = options.folder ?? path.resolve(rootDir, 'views')
  const logger = options.logger ?? silentLogger
  const writer = options.writer ?? write
  const viewFiles = getFilesFromFolder(viewsFolder, ['.sql'])
  const viewStatements = await Promise.all(
    viewFiles.map(async view => ({
      view,
      sql: await readMigrationFile(viewsFolder, view),
    })),
  )

  if (options.forced) {
    const declarations = uniqueViewDeclarations(
      viewStatements.flatMap(viewStatement => extractViewDeclarations(viewStatement.sql)),
    )
    if (declarations.length > 0) {
      await dropPendingViews(writer, declarations, logger)
      if (!isTest) {
        logger.log('Forced view rebuild: dropped %d views before recreation', declarations.length)
      }
    }
  }

  const pendingViews = [...viewStatements]

  async function attemptPendingViews() {
    const attemptedViews: AttemptedView[] = []
    let lastError: unknown = null

    async function attemptViewAt(index: number): Promise<void> {
      const pendingView = pendingViews[index]
      if (!pendingView) return

      try {
        await runViewStatements(writer, pendingView.sql)
        if (!isTest) {
          logger.log('View %s updated!', pendingView.view)
        }
        attemptedViews.push({ pendingView, success: true })
      } catch (error) {
        lastError = error
        attemptedViews.push({ pendingView, success: false })
      }

      await attemptViewAt(index + 1)
    }

    await attemptViewAt(0)
    return { attemptedViews, lastError }
  }

  async function rebuildPendingViews(): Promise<void> {
    if (pendingViews.length === 0) return

    const { attemptedViews, lastError } = await attemptPendingViews()
    const progressMade = attemptedViews.some(result => result.success)
    pendingViews.splice(
      0,
      pendingViews.length,
      ...attemptedViews.flatMap(result => (!result.success ? [result.pendingView] : [])),
    )

    if (!progressMade) {
      throwBlockedViewsError(pendingViews, lastError, logger)
    }

    await rebuildPendingViews()
  }

  await rebuildPendingViews()
}

async function dropPendingViews(
  writer: QueryExecutor,
  pendingDeclarations: ManagedViewDeclaration[],
  logger: ViewLogger,
): Promise<void> {
  if (pendingDeclarations.length === 0) return
  const remainingDeclarations: ManagedViewDeclaration[] = []
  let lastDependencyError: unknown = null

  async function dropDeclarationAt(index: number): Promise<void> {
    const declaration = pendingDeclarations[index]
    if (!declaration) return
    try {
      await writer(`/* runViews */ ${buildDropViewStatement(declaration)}`)
    } catch (error) {
      if (!isDependentObjectError(error)) throw error
      lastDependencyError = error
      remainingDeclarations.push(declaration)
    }
    await dropDeclarationAt(index + 1)
  }

  await dropDeclarationAt(0)
  if (remainingDeclarations.length === pendingDeclarations.length) {
    throwBlockedViewDropsError(remainingDeclarations, lastDependencyError, logger)
  }
  await dropPendingViews(writer, remainingDeclarations, logger)
}

async function runViewStatements(writer: QueryExecutor, sql: string): Promise<void> {
  const statements = splitSqlStatements(sql)

  async function runStatementAt(index: number): Promise<void> {
    const statement = statements[index]
    if (!statement) return
    await writer(`/* runViews */ ${statement}`)
    await runStatementAt(index + 1)
  }

  await runStatementAt(0)
}

function throwBlockedViewsError(
  pendingViews: PendingViewStatement[],
  lastError: unknown,
  logger: ViewLogger,
): never {
  const blockedViews = pendingViews.map(viewStatement => viewStatement.view).join(', ')
  logger.error('ERROR: view recreation made no progress; blocked views: %s', blockedViews)
  logger.error(lastError)
  if (lastError instanceof Error) {
    throw new Error(lastError.message, { cause: lastError })
  }
  throw new Error(`View recreation made no progress for: ${blockedViews}`)
}

function uniqueViewDeclarations(declarations: ManagedViewDeclaration[]): ManagedViewDeclaration[] {
  const seenDeclarations = new Set<string>()
  return declarations.filter(declaration => {
    const key = `${declaration.type}:${declaration.name}`
    if (seenDeclarations.has(key)) return false
    seenDeclarations.add(key)
    return true
  })
}

function isDependentObjectError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '2BP01')
}

function throwBlockedViewDropsError(
  declarations: ManagedViewDeclaration[],
  lastDependencyError: unknown,
  logger: ViewLogger,
): never {
  const blockedViews = declarations.map(declaration => declaration.name).join(', ')
  const message = `Forced view teardown made no progress; blocked views: ${blockedViews}`
  logger.error('ERROR: %s', message)
  logger.error(lastDependencyError)
  throw new Error(message, { cause: lastDependencyError })
}
