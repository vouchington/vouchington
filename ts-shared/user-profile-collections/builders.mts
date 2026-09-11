import type { MessageKey } from '@ts-shared/ui-messages'
import type {
  CollectionInput,
  UserProfileCollectionAction,
  UserProfileCollectionEntityType,
  UserProfileCollectionEntry,
  UserProfileCollectionPredicate,
  UserProfileCollectionRelation,
} from './types.mts'

export function collection<const T extends CollectionInput>(
  entry: T,
): T & UserProfileCollectionEntry {
  const serviceListType = entry.serviceListType ?? entry.routeListType
  const metricGroup = entry.metricGroup ?? 'private_count'
  const managementTab = entry.managementTab ?? true
  const topLevelTab = entry.topLevelTab ?? entry.group
  const tabValue = entry.tabValue ?? entry.id

  return {
    ...entry,
    serviceListType,
    metricGroup,
    managementTab,
    topLevelTab,
    tabValue,
  }
}

export function action(
  group: UserProfileCollectionAction['group'],
  key: string,
  entityType: UserProfileCollectionEntityType,
  predicate: UserProfileCollectionPredicate,
  activeLabel: MessageKey,
  inactiveLabel: MessageKey,
  errorLabel: MessageKey,
): UserProfileCollectionAction {
  return {
    group,
    key,
    entityType,
    predicate,
    activeLabel,
    inactiveLabel,
    errorLabel,
  }
}

export function relation(
  tableName: string,
  entityType: UserProfileCollectionEntityType,
  predicate: UserProfileCollectionPredicate,
  direction: 'object' | 'subject',
  targetTable: string,
  targetDeletedAtFilter: boolean = true,
): UserProfileCollectionRelation {
  return { tableName, entityType, predicate, direction, targetTable, targetDeletedAtFilter }
}
