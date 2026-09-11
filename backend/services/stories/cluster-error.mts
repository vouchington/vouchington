export class StoryRaceConditionError extends Error {
  constructor() {
    super('story_race_condition')
    this.name = 'StoryRaceConditionError'
  }
}
