import type { AgentStatus } from '../../types';

export type VoiceInteractionPhase = 'unsupported' | 'processing' | 'listening' | 'connecting' | 'tap-to-talk';
export type VoiceInteractionLanguage = 'zh-CN' | 'en-US';

type VoiceInteractionState = {
  awake: boolean;
  listening: boolean;
  status: AgentStatus;
  supported: boolean;
};

type VoiceInteractionCopy = {
  activityLabel: string;
  badgeLabel: string;
  caption: string;
  prompt: string;
};

const VOICE_INTERACTION_COPY: Record<VoiceInteractionLanguage, Record<VoiceInteractionPhase, VoiceInteractionCopy>> = {
  'zh-CN': {
    unsupported: {
      activityLabel: '语音链路不可用',
      badgeLabel: 'OFFLINE',
      caption: '当前浏览器无法使用语音输入。',
      prompt: '当前浏览器无法使用语音输入。',
    },
    processing: {
      activityLabel: '本轮收音已结束，AI 正在回应',
      badgeLabel: 'PROCESSING',
      caption: '本轮收音已结束；下一轮请重新点击麦克风。',
      prompt: 'AI 正在回应；下一轮请重新点击麦克风。',
    },
    listening: {
      activityLabel: '正在监听驾驶员指令',
      badgeLabel: 'LISTENING',
      caption: '语音模式已激活，可以直接说。',
      prompt: '座舱正在收音。',
    },
    connecting: {
      activityLabel: '正在建立收音链路',
      badgeLabel: 'CONNECTING',
      caption: '正在连接麦克风，请稍候。',
      prompt: '正在连接麦克风，请稍候。',
    },
    'tap-to-talk': {
      activityLabel: '点击麦克风开始下一轮',
      badgeLabel: 'TAP TO TALK',
      caption: '点击麦克风开始下一轮语音提问。',
      prompt: '本轮收音已结束，点击麦克风继续讲话。',
    },
  },
  'en-US': {
    unsupported: {
      activityLabel: 'Voice link unavailable',
      badgeLabel: 'OFFLINE',
      caption: 'Voice input is unavailable in this browser.',
      prompt: 'Voice input is unavailable in this browser.',
    },
    processing: {
      activityLabel: 'Capture ended; AI is responding',
      badgeLabel: 'PROCESSING',
      caption: 'Capture ended. Tap the microphone again for the next turn.',
      prompt: 'AI is responding. Tap the microphone again for the next turn.',
    },
    listening: {
      activityLabel: 'Listening for pilot command',
      badgeLabel: 'LISTENING',
      caption: 'Voice mode is active. Speak naturally.',
      prompt: 'Cockpit voice capture is active.',
    },
    connecting: {
      activityLabel: 'Connecting voice link',
      badgeLabel: 'CONNECTING',
      caption: 'Connecting the microphone…',
      prompt: 'Connecting the microphone…',
    },
    'tap-to-talk': {
      activityLabel: 'Tap microphone for next turn',
      badgeLabel: 'TAP TO TALK',
      caption: 'Tap the microphone to start the next voice turn.',
      prompt: 'Capture ended. Tap the microphone to speak again.',
    },
  },
};

export function resolveVoiceInteractionPhase({ awake, listening, status, supported }: VoiceInteractionState): VoiceInteractionPhase {
  if (!supported) {
    return 'unsupported';
  }

  if (status === 'streaming') {
    return 'processing';
  }

  if (listening) {
    return 'listening';
  }

  if (awake) {
    return 'connecting';
  }

  return 'tap-to-talk';
}

export function getVoiceInteractionCopy(phase: VoiceInteractionPhase, language: VoiceInteractionLanguage = 'zh-CN') {
  return VOICE_INTERACTION_COPY[language][phase];
}
