export interface ActivityEntry {
  id: string;
  org_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  users?: { id: string; full_name: string; email: string; avatar_url: string | null };
}

export interface ActivityFilters {
  entity_types: string[];
  actions: string[];
  users: Array<{ id: string; full_name: string }>;
}
