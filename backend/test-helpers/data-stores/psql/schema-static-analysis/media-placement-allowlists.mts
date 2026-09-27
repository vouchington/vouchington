/* v8 ignore start -- declarative schema-test allowlists have no executable branches */
export const MEDIA_PLACEMENT_MISSING_UPDATED_AT = new Map<string, string>([
  ['post_images', 'Pure post-image join table.'],
  [
    'image_placements',
    'Immutable post/image placement bindings never update; lifecycle mutations belong to the parent media_placements row.',
  ],
  [
    'copyright_legal_hold_restrictions',
    'Immutable typed provenance bindings are inserted once and never update after a qualifying legal-hold assessment.',
  ],
])
/* v8 ignore stop */
