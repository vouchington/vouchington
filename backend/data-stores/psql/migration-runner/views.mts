import path from 'node:path'
import { write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { getFilesFromFolder, readMigrationFile } from './files.mts'
import { splitSqlStatements } from './sql-statements.mts'
import { buildDropViewsStatement, extractViewNames } from './view-sql.mts'

const isTest = process.env.NODE_ENV === 'test'

export type ViewLogger = { error: typeof console.error; log: typeof console.log }

const silentLogger: ViewLogger = { error: () => {}, log: () => {} }

type PendingViewStatement = { sql: string; view: string }
type AttemptedView = { pendingView: PendingViewStatement; success: boolean }
export { buildDropViewsStatement, extractViewNames } from './view-sql.mts'

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
    const uniqueViewNames = [
      ...new Set(viewStatements.flatMap(viewStatement => extractViewNames(viewStatement.sql))),
    ]
    const dropStatement = buildDropViewsStatement(uniqueViewNames)

    if (dropStatement) {
      await writer(`/* runViews */ ${dropStatement}`)
      if (!isTest) {
        logger.log(
          'Forced view rebuild: dropped %d views before recreation',
          uniqueViewNames.length,
        )
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
