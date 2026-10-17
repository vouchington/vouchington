-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_create_community_search_counts() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO community_search_counts (community_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_create_community_search_counts
  AFTER INSERT ON communities FOR EACH ROW EXECUTE FUNCTION fn_create_community_search_counts();

CREATE OR REPLACE FUNCTION fn_project_community_member_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD.removed_at IS NULL THEN
      UPDATE community_search_counts SET member_count = member_count - 1
      WHERE community_id = OLD.community_id;
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.removed_at IS NULL THEN
      UPDATE community_search_counts SET member_count = member_count + 1
      WHERE community_id = NEW.community_id;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_project_community_member_count
  AFTER INSERT OR UPDATE OF community_id, removed_at OR DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION fn_project_community_member_count();

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
