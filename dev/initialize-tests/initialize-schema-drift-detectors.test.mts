import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { sourceBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const initializePath = fileURLToPath(new URL('../initialize', import.meta.url))
const schemaDriftDetectorsPath = fileURLToPath(
  new URL('../lib/schema-drift-detectors.sh', import.meta.url),
)

describe('initialize schema drift detector structure', () => {
  it('loads migration-specific schema drift detectors from dev/lib', async () => {
    const initializeSource = await readFile(initializePath, 'utf8')
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(schemaDriftDetectorsPath, 'declare -F'),
    )

    expect(initializeSource).toContain('source "$REPO_ROOT/dev/lib/schema-drift-detectors.sh"')
    expect(initializeSource).toContain('reset_database_if_schema_mismatch()')
    expect(initializeSource).not.toContain('0060-00-00-recently-viewed.sql')
    expect(initializeSource).not.toContain('0140-00-00-communities-publications.sql')
    expect(initializeSource).not.toContain('0070-00-00-posts-feed-content.sql')
    expect(stdout).toContain('declare -f detect_recently_viewed_schema_drift')
    expect(stdout).toContain('declare -f detect_community_auto_tagger_schema_drift')
    expect(stdout).toContain('declare -f detect_posts_language_schema_drift')
    expect(stdout).toContain('declare -f detect_stale_schema_reason')
  })
})
