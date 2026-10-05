// Existing enums retain their original creators; this catalog types their current consumers.
export const EXISTING_FINITE_VALUES_5 = {
  revision_types: ['create', 'update', 'delete'],
  user_display_name_sources: [
    'username',
    'facebook',
    'x',
    'apple',
    'google',
    'linkedin',
    'microsoft',
    'github',
  ],
} as const
