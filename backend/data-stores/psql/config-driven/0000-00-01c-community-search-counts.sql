-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_create_community_search_counts() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO community_search_counts (community_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_create_community_search_counts
  AFTER INSERT ON communities FOR EACH ROW EXECUTE FUNCTION fn_create_community_search_counts();

CREATE OR REPLACE FUNCTION fn_project_community_active_count() RETURNS TRIGGER AS $$
DECLARE
  is_member BOOLEAN := TG_TABLE_NAME = 'community_members';
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.removed_at IS NULL THEN
      UPDATE community_search_counts SET
        member_count = member_count - CASE WHEN is_member THEN 1 ELSE 0 END,
        list_item_count = list_item_count - CASE WHEN is_member THEN 0 ELSE 1 END
      WHERE community_id = OLD.community_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.removed_at IS NULL THEN
      UPDATE community_search_counts SET
        member_count = member_count + CASE WHEN is_member THEN 1 ELSE 0 END,
        list_item_count = list_item_count + CASE WHEN is_member THEN 0 ELSE 1 END
      WHERE community_id = NEW.community_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_project_community_member_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();

CREATE OR REPLACE FUNCTION fn_project_community_virtual_subscription_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE community_search_counts
        SET virtual_subscription_count = virtual_subscription_count - 1
      WHERE community_id = OLD.object_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE community_search_counts
        SET virtual_subscription_count = virtual_subscription_count + 1
      WHERE community_id = NEW.object_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_project_community_proxy_follow_count
  AFTER INSERT OR UPDATE OF object_id, deleted_at OR DELETE ON relation__user__proxy_follow__community
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_virtual_subscription_count();
CREATE OR REPLACE TRIGGER trigger_project_community_proxy_mute_count
  AFTER INSERT OR UPDATE OF object_id, deleted_at OR DELETE ON relation__user__proxy_mute__community
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_virtual_subscription_count();

CREATE OR REPLACE TRIGGER trigger_project_community_list_topics_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_list_topics
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();
CREATE OR REPLACE TRIGGER trigger_project_community_list_rss_feeds_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_list_rss_feeds
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();
CREATE OR REPLACE TRIGGER trigger_project_community_list_posts_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_list_posts
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();
CREATE OR REPLACE TRIGGER trigger_project_community_list_url_hostnames_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_list_url_hostnames
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();
CREATE OR REPLACE TRIGGER trigger_project_community_list_urls_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_list_urls
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_active_count();
