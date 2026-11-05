#!/usr/bin/env bash
test "$(git rev-parse HEAD)" = "$SNAPSHOT_HEAD_SHA"
node --input-type=module -e '
  const { applyAllMigrations } = await import("./data-stores/psql/migrate.mts")
  const { generateSchemaSnapshot } = await import("./data-stores/psql/schema-snapshot/generate.mts")
  const { close } = await import("./data-stores/psql/runtime.mts")
  try {
    await applyAllMigrations()
    await generateSchemaSnapshot()
  } finally {
    await close()
  }
'
