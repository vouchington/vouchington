// Canonical definitions live in @voucha/types/entities/story (avoids a
// @voucha/test-helpers <-> @services/stories workspace cycle: test-helpers
// needs the Story shape but must not depend on @services/*).
export type { Story, StoryWithItemCount, PostStory } from '@voucha/types/entities/story'
