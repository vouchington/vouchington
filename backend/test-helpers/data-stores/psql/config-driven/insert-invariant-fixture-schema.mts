import type {
  SchemaColumnSnapshot,
  SchemaSnapshot,
  SchemaTableSnapshot,
} from 'vouchington-tooling/pg-schema-snapshot'

// Bounded stand-in for the insert-invariant checker. It copies the shipped trigger and
// generated-column shape those tests name. The static script checks generators against schema.json.
function column(
  partial: Partial<SchemaColumnSnapshot> & Pick<SchemaColumnSnapshot, 'type'>,
): SchemaColumnSnapshot {
  return {
    nullable: true,
    defaultExpression: null,
    generatedExpression: null,
    identity: null,
    generated: null,
    collation: null,
    comment: null,
    ordinalPosition: 1,
    ...partial,
  }
}

function table(
  columns: SchemaTableSnapshot['columns'],
  triggers: SchemaTableSnapshot['triggers'] = {},
): SchemaTableSnapshot {
  return {
    relationKind: 'table',
    columns,
    primaryKey: null,
    uniqueConstraints: {},
    checkConstraints: {},
    foreignKeys: {},
    indexes: {},
    triggers,
    comment: null,
    physicalPartition: null,
    partition: null,
    growth: 'bounded',
  }
}

const virtualCreatedAt = column({
  type: 'timestamp with time zone',
  generated: 'virtual',
  generatedExpression: 'uuid_extract_timestamp(id)',
})

export const insertInvariantFixtureSchema: SchemaSnapshot = {
  formatVersion: 2,
  tables: {
    currencies: table({
      code: column({ type: 'text', nullable: false }),
    }),
    topic_aliases: table(
      {
        created_at: { ...virtualCreatedAt, ordinalPosition: 7 },
        search_vector: column({
          type: 'tsvector',
          generated: 'stored',
          generatedExpression:
            "setweight(to_tsvector('voucha_english'::regconfig, alias), 'A'::\"char\")",
          ordinalPosition: 6,
        }),
      },
      {
        trigger_active_topic_references:
          "CREATE TRIGGER trigger_active_topic_references BEFORE INSERT OR DELETE OR UPDATE ON public.topic_aliases FOR EACH ROW EXECUTE FUNCTION fn_ensure_active_topic_references('topic_id', 'unlink_topic_id')",
        trigger_topic_aliases_mark_category_mapping_dirty:
          'CREATE TRIGGER trigger_topic_aliases_mark_category_mapping_dirty AFTER INSERT OR DELETE OR UPDATE OF topic_id, unlink_requested_at ON public.topic_aliases FOR EACH ROW EXECUTE FUNCTION fn_project_mark_topic_alias_category_mapping_dirty()',
        trigger_topic_aliases_project_delete:
          'CREATE TRIGGER trigger_topic_aliases_project_delete AFTER DELETE ON public.topic_aliases REFERENCING OLD TABLE AS old_aliases FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases()',
        trigger_topic_aliases_project_insert:
          'CREATE TRIGGER trigger_topic_aliases_project_insert AFTER INSERT ON public.topic_aliases REFERENCING NEW TABLE AS new_aliases FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases()',
        trigger_topic_aliases_project_update:
          'CREATE TRIGGER trigger_topic_aliases_project_update AFTER UPDATE ON public.topic_aliases REFERENCING OLD TABLE AS old_aliases NEW TABLE AS new_aliases FOR EACH STATEMENT EXECUTE FUNCTION fn_project_topic_aliases()',
        trigger_topic_aliases_updated_at:
          'CREATE TRIGGER trigger_topic_aliases_updated_at BEFORE UPDATE ON public.topic_aliases FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()',
        trigger_topic_merge_slug_alias_reservation:
          'CREATE TRIGGER trigger_topic_merge_slug_alias_reservation BEFORE INSERT OR DELETE OR UPDATE ON public.topic_aliases FOR EACH ROW EXECUTE FUNCTION fn_ensure_topic_merge_slug_alias_not_reserved()',
      },
    ),
    agents: table(
      { created_at: { ...virtualCreatedAt, ordinalPosition: 6 } },
      {
        trigger_agents_system_account:
          'CREATE TRIGGER trigger_agents_system_account BEFORE INSERT OR UPDATE OF system_user_id ON public.agents FOR EACH ROW EXECUTE FUNCTION fn_reject_agent_system_account()',
        trigger_agents_updated_at:
          'CREATE TRIGGER trigger_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at()',
        trigger_moderation_transparency_agents_lock:
          'CREATE TRIGGER trigger_moderation_transparency_agents_lock BEFORE UPDATE OF deleted_at ON public.agents FOR EACH ROW EXECUTE FUNCTION fn_lock_agent_moderation_transparency_agent()',
      },
    ),
  },
  views: {},
  enums: {},
  extensions: {},
  functions: {},
  policies: {},
}
