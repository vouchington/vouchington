import { explainAnalyze, write } from '@data-stores/psql'
import { createTestUserDirect } from './entities/users-direct.mts'

export async function createExplainWalCaptureFixture(scenarioId: string) {
  const user = await createTestUserDirect()
  const input = {
    name: 'wal-condition-test',
    text: `/* walConditionTest */ UPDATE users SET markdown = $2
      WHERE id = $1 AND current_setting('application_name') = $3 RETURNING id`,
    values: [user.id, 'temporary change', 'wal-condition-test'],
    scenarioId,
    captureIndex: 0,
    localSettings: { application_name: 'wal-condition-test' },
  }
  return {
    input,
    async captureCold() {
      await write('/* walConditionTestCheckpoint */ CHECKPOINT')
      return explainAnalyze(input.name, input.text, input.values, {
        localSettings: input.localSettings,
        planCacheMode: 'force_custom_plan',
      })
    },
    async readMarkdown() {
      const { rows } = await write(
        '/* walConditionTestRead */ SELECT markdown FROM users WHERE id = $1',
        [user.id],
      )
      return rows[0]?.markdown
    },
    async cleanup() {
      await write('/* walConditionTestCleanup */ DELETE FROM users WHERE id = $1', [user.id])
    },
  }
}
