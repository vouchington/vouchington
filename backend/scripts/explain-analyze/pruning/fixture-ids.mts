const RELATION_TABLE = 'relation__post__category__topic' as const

function idAt(year: number, day: number, sequence: number): string {
  const time = Date.UTC(year, 0, day).toString(16).padStart(12, '0')
  return `${time.slice(0, 8)}-${time.slice(8)}-7000-8000-${sequence.toString(16).padStart(12, '0')}`
}

export const pruningFixture = {
  userId: idAt(2023, 1, 1),
  topicId: idAt(2023, 1, 2),
  otherTopicId: idAt(2023, 1, 3),
  posts: [2024, 2025, 2026].map((year, index) => idAt(year, 3, index + 1)),
  conversations: [2024, 2025, 2026].map((year, index) => idAt(year, 6, index + 1)),
  relations: [2024, 2025, 2026].map((year, index) => idAt(year, 4, index + 1)),
  otherRelation: idAt(2024, 5, 7),
  relationTable: RELATION_TABLE,
}
