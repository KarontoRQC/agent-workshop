export type DialogueMode = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ReplySource = 'coze-stream' | 'endpoint' | 'local-mock';

export type AgentStatus = 'idle' | 'streaming' | 'completed' | 'error';

export type AgentLineupId = 'core' | 'growth' | 'conversion';

export type AgentAction =
  | {
      type: 'chat';
    }
  | {
      confidence: number;
      label: string;
      route: string[];
      type: 'focus_graph_path';
    };

export type ParticleSettings = {
  mode: DialogueMode;
  energy: number;
  pulseSeed: number;
};

export type Message = {
  id: number;
  speaker: 'you' | 'ai';
  text: string;
};

export type RecommendedAgent = {
  activeField?: string | null;
  agent_id?: string;
  agent_index?: number;
  agent_name?: string;
  avatarUrl?: string;
  avatar_url?: string;
  description?: string;
  endpoint?: string;
  function?: string;
  id?: string;
  jump_url?: string;
  launch_url?: string;
  lineup?: AgentLineupId | string;
  lineup_id?: AgentLineupId | string;
  lineupId?: AgentLineupId | string;
  link?: string;
  name?: string;
  rank?: number | string;
  reason?: string;
  source?: string;
  stage?: string;
  streamStatus?: 'streaming' | 'completed';
  score?: number | string;
  tags?: string[];
  type?: string;
  url?: string;
  [key: string]: unknown;
};

export type AgentCatalogItem = {
  agentKey?: string;
  agent_key?: string;
  agent_name?: string;
  avatar?: string;
  avatarUrl?: string;
  avatar_url?: string;
  description?: string;
  endpoint?: string;
  function?: string;
  functionLabel?: string;
  has_avatar?: boolean;
  id?: string;
  knowledge?: string[];
  launchUrl?: string;
  launch_url?: string;
  link?: string;
  name?: string;
  reason?: string;
  tags?: string[];
  type?: string;
  typeLabel?: string;
  url?: string;
  [key: string]: unknown;
};

export type AgentUserState = {
  knowledge_path?: string;
  knowledge_path_nodes?: string[];
  lineups?: Partial<
    Record<
      AgentLineupId,
      Array<{
        agent_name?: string;
        key?: string;
        lineup?: AgentLineupId | string;
        name?: string;
        rank?: number | string;
        reason?: string;
        stage?: string;
      }>
    >
  >;
  recommended_agents?: Array<{
    agent_name?: string;
    lineup?: AgentLineupId | string;
    name?: string;
    rank?: number | string;
    reason?: string;
    stage?: string;
  }>;
  recommendation_summary?: string;
};

export type AgentGraphPath = {
  edges?: unknown[];
  nodes?: Array<{ label?: string; [key: string]: unknown }>;
  route?: string;
  [key: string]: unknown;
};

export type RecommendationSnapshotStatus = 'streaming' | 'completed' | 'failed';

export type RecommendationSnapshot = {
  agents: RecommendedAgent[];
  conversation_ids: Record<string, string>;
  created_at: string;
  error?: string;
  graph_path: AgentGraphPath | null;
  id: string;
  message: string;
  status: RecommendationSnapshotStatus;
  summary: string;
  updated_at: string;
};

export type AgentWorkflow = {
  knowledgeGraph: {
    ACK: string;
    DIRECT_REPLY: string;
    EXPLANATION: string;
    KG_PATH: string;
    THINKING_PROCESS: string;
    graphPath: AgentGraphPath | null;
  };
  agentRecommendation: {
    ACK: string;
    SUMMARY: string;
    THINKING_PROCESS: string;
    agents: RecommendedAgent[];
    lineupIntent?: AgentLineupId | string;
  };
};

export type AgentTurn = {
  error: string;
  fallbackText: string;
  id: string;
  source: ReplySource;
  status: AgentStatus;
  user: string;
  workflow: AgentWorkflow;
};

export type ChatResponse = {
  actions: AgentAction[];
  recommendedAgents?: RecommendedAgent[];
  source: ReplySource;
  spokenText?: string;
  text: string;
};
