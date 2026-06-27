export type DialogueMode = 'idle' | 'listening' | 'thinking' | 'speaking';

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
