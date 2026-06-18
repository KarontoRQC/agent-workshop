-- Knowledge graph content schema.
-- This schema stores only business semantics and agent bindings.
-- Frontend layout fields such as x, y, radius, color, fan, ring, opacity are intentionally excluded.

create table if not exists nodes (
  id text primary key,
  title text not null,
  node_type text not null,
  parent_id text references nodes(id),
  level integer,
  summary text not null default '',
  insight text not null default '',
  status text not null default 'active',
  is_leaf boolean not null default false,
  sort_order integer not null default 999,
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists edges (
  id text primary key,
  source_node_id text not null references nodes(id),
  target_node_id text not null references nodes(id),
  relation_type text not null,
  relation_label text not null default '',
  sort_order integer not null default 999,
  created_at timestamp default current_timestamp,
  unique (source_node_id, target_node_id, relation_type)
);

create table if not exists agents (
  id text primary key,
  agent_key text not null unique,
  name text not null,
  role text not null default '',
  provider text not null default 'coze',
  endpoint text not null default '/api/agent-gateway/chat',
  score integer,
  status text not null default 'active',
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

create table if not exists node_agents (
  id text primary key,
  node_id text not null references nodes(id),
  agent_id text not null references agents(id),
  priority integer not null default 999,
  relation_type text not null default 'recommended_agent',
  created_at timestamp default current_timestamp,
  unique (node_id, agent_id, relation_type)
);

create index if not exists idx_nodes_parent_id on nodes(parent_id);
create index if not exists idx_nodes_type on nodes(node_type);
create index if not exists idx_edges_source on edges(source_node_id);
create index if not exists idx_edges_target on edges(target_node_id);
create index if not exists idx_node_agents_node on node_agents(node_id);
create index if not exists idx_node_agents_agent on node_agents(agent_id);
