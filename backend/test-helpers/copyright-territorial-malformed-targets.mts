/** Original invalid territorial target bodies, each exercised through the real staff route. */
export function malformedTerritorialTargetBodies(): [string, Record<string, unknown>][] {
  const duplicatePostId = crypto.randomUUID()
  const duplicateImageId = crypto.randomUUID()
  return [
    ['targets on no_action', { targets: [] }],
    [
      'a valid target on no_action',
      {
        targets: [
          {
            surface: 'post-image',
            post_id: crypto.randomUUID(),
            image_id: crypto.randomUUID(),
            target_url: 'https://example.test/posts/one',
          },
        ],
      },
    ],
    ['missing targets on restrict', { outcome: 'restrict', targets: undefined }],
    ['empty targets on restrict', { outcome: 'restrict', targets: [] }],
    [
      'target without a surface discriminator',
      {
        outcome: 'restrict',
        targets: [
          {
            post_id: crypto.randomUUID(),
            image_id: crypto.randomUUID(),
            target_url: 'https://example.test/posts/one',
          },
        ],
      },
    ],
    [
      'non-post target',
      {
        outcome: 'restrict',
        targets: [
          {
            surface: 'community-profile-image',
            community_id: crypto.randomUUID(),
            image_id: crypto.randomUUID(),
            target_url: 'https://example.test/communities/one',
          },
        ],
      },
    ],
    [
      'duplicate target pair',
      {
        outcome: 'restrict',
        targets: [
          {
            surface: 'post-image',
            post_id: duplicatePostId,
            image_id: duplicateImageId,
            target_url: 'https://example.test/posts/one',
          },
          {
            surface: 'post-image',
            post_id: duplicatePostId,
            image_id: duplicateImageId,
            target_url: 'https://example.test/posts/one',
          },
        ],
      },
    ],
  ]
}
