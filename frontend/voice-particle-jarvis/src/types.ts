export type DialogueMode = 'idle' | 'listening' | 'thinking' | 'speaking';

export type ReplySource = 'local-mock' | 'endpoint';

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
