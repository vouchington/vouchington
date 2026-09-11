import { execFileSync } from 'node:child_process'
import type { ProbeStatus } from './types.mts'
import { commandErrorMessage } from './command-error.mts'

export function probeKnownSchemaDrift(databaseUrl: string, cwd: string): ProbeStatus {
  if (!databaseHasMigrationsTable(databaseUrl, cwd)) {
    return { checked: true, ok: true }
  }

  try {
    const reason = execFileSync(
      'psql',
      [
        databaseUrl,
        '-Atqc',
        `
          -- Keep in sync with dev/lib/schema-drift-detectors.sh:detect_posts_language_schema_drift.
          SELECT CASE
            WHEN EXISTS (
              SELECT 1
              FROM migrations
              WHERE id = '0070-00-00-posts-feed-content.sql'
            )
            AND (
              NOT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'posts'
                  AND column_name IN ('declared_language', 'lingua_rs_detected_language')
                HAVING COUNT(*) = 2
              )
              OR (
                to_regclass('view_posts') IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1
                  FROM information_schema.columns
                  WHERE table_schema = 'public'
                    AND table_name = 'view_posts'
                    AND column_name IN ('declared_language', 'lingua_rs_detected_language')
                  HAVING COUNT(*) = 2
                )
              )
            )
            THEN 'applied posts migration is missing language columns used by view_posts'
            ELSE ''
          END
        `,
      ],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
      },
    ).trim()

    return reason ? { checked: true, message: reason, ok: false } : { checked: true, ok: true }
  } catch (err) {
    return {
      checked: true,
      message: commandErrorMessage(err),
      ok: false,
    }
  }
}

function databaseHasMigrationsTable(databaseUrl: string, cwd: string): boolean {
  try {
    const result = execFileSync(
      'psql',
      [
        databaseUrl,
        '-Atqc',
        `
          SELECT CASE
            WHEN to_regclass('migrations') IS NOT NULL THEN 't'
            ELSE 'f'
          END
        `,
      ],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5_000,
      },
    ).trim()
    return result === 't'
  } catch {
    return false
  }
}
