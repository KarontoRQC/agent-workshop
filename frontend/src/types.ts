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
  agent_index?: number;
  agent_name?: string;
  endpoint?: string;
  id?: string;
  jump_url?: string;
  lineup?: AgentLineupId | string;
  lineup_id?: AgentLineupId | string;
  lineupId?: AgentLineupId | string;
  link?: string;
  name?: string;
  rank?: number | string;
  reason?: string;
  stage?: string;
  streamStatus?: 'streaming' | 'completed';
  score?: number | string;
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
