// Relocated to @voucha/types (pure config data, no service dependencies) so that
// backend/test-helpers can use these types without creating a
// test-helpers -> services workspace cycle. Re-exported here for call-site stability.
export type { List, ListItem, ListItemType, ListVisibility } from '@voucha/types/entities/list'
