import { describe, expect, it } from 'vitest'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { createHumanTopicRelation } from '@voucha/test-helpers/data-stores/psql/classifier-runs/subject-topic-relations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { readAutotaggerAppliedTopicNames } from './applied-topics.mts'
import { autotaggerAgentWorkConfig } from './work-limits.mts'

describe('readAutotaggerAppliedTopicNames (real PG)', () => {
  it('reads every applied topic name up to the configured limit, ordered by name', async () => {
    const fixture = await createAutotaggerPostFixture({ topicCount: 2 })
    for (const topic of fixture.topics)
      await createHumanTopicRelation(fixture.user, fixture.subject, topic.id)
    const names = fixture.topics.map(topic => topic.name).toSorted()

    expect(await readAutotaggerAppliedTopicNames(fixture.subject)).toEqual(names)

    await autotaggerAgentWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(autotaggerAgentWorkConfig, {
      max_applied_topic_names: 1,
    })
    try {
      expect(await readAutotaggerAppliedTopicNames(fixture.subject)).toEqual([names[0]])
    } finally {
      restore()
    }
  })
})
