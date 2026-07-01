import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Activity, Cpu, Radar, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import ParticleField from './components/ParticleField';
import { AgentConsole, type InputMode } from './features/agentConsole/AgentConsole';
import { getRecommendedAgentKey } from './features/agents/agentUtils';
import { AgentHeroHall } from './features/heroHall/AgentHeroHall';
import {
  createHeroHallLineups,
  createHeroHallLineupsFromAgents,
  detectRequestedLineupFromText,
  getCatalogAgentsForLineup,
  getHeroHallAgentKey,
  getLineupIntentFromEvent,
  getRecommendedAgentLineup,
  mergeHeroHallLineups,
  type HeroHallLineupId,
  type HeroHallLineupsState,
} from './features/heroHall/heroHallModel';
import {
  cancelSpeechPlayback,
  extractWakeCommand,
  getTtsMode,
  isFallbackableTtsError,
  primeSpeechOutput,
  requestTtsAudio,
  speak,
  type SpeechOutputOptions,
  wantsSleep,
} from './features/speech/speechOutput';
import { WorkflowDock } from './features/workflow/WorkflowDock';
import {
  PATH_MATCH_ANIMATION_MS,
  RECOMMENDATION_DOCK_REVEAL_MS,
  SPEECH_SEGMENT_WAIT_MS,
  appendWorkflowContent,
  buildAgentReplyText,
  buildHeroHallLineupUserState,
  cleanSpeechText,
  createAgentTurn,
  createClientConversationIds,
  createEmptyAgentWorkflow,
  createEmptyWorkflowRevealState,
  ensureClientConversationIds,
  extractAckSpeechText,
  formatWorkflowError,
  getActionFromRoute,
  getCompletedSpeechSegment,
  getLatestAgentUserState,
  getLatestDisplayableRecommendedAgents,
  getLatestRecommendationSummary,
  getLatestRouteSegments,
  getRevealForSpeechSegment,
  getSpeechTextForSegment,
  getTextKeyForSpeechSegment,
  getVisibleWorkflow,
  getWorkflowSection,
  mergeAgentUserState,
  mergeConversationIdsFromEvent,
  replaceRecommendedAgents,
  setWorkflowGraphPath,
  setWorkflowLineupIntent,
  updateTurnById,
  upsertRecommendedAgent,
  wait,
  type AgentConversationIds,
  type PreloadedSpeechAsset,
  type SpeechSegmentKey,
  type SubmitMessageOptions,
  type WorkflowHighlight,
  type WorkflowRevealState,
  type WorkflowTextKey,
  type WorkflowTextOverrides,
} from './features/workflow/workflowModel';
import { useMicLevel } from './hooks/useMicLevel';
import { useVoiceControl } from './hooks/useVoiceControl';
import { streamAgentChat, type AgentStreamEvent } from './lib/agentStreamClient';
import { requestAIReply } from './lib/aiClient';
import { detectConversationLanguage, isChineseLanguage, type ConversationLanguage } from './lib/language';
import type {
  AgentAction,
  AgentGraphPath,
  AgentStatus,
  AgentTurn,
  AgentWorkflow,
  Message,
  ParticleSettings,
  RecommendedAgent,
  ReplySource,
} from './types';
import './App.css';

const baseSettings: ParticleSettings = {
  energy: 0.34,
  mode: 'idle',
  pulseSeed: 0,
};

const demoGraphAction: AgentAction = {
  confidence: 1,
  label: 'knowledge graph preview',
  route: ['Agent Workshop', 'Knowledge Graph', 'Path selection', 'Graph controller'],
  type: 'focus_graph_path',
};

type HelmetIntelState = {
  channel: string;
  copy: string;
  id: string;
  metaLeft: string;
  metaRight: string;
  tone: 'active' | 'nominal' | 'warning';
};

function buildHelmetIntelStates({
  graphRoute,
  recommendedAgents,
  status,
  voiceAwake,
}: {
  graphRoute: string[];
  recommendedAgents: RecommendedAgent[];
  status: AgentStatus;
  voiceAwake: boolean;
}): HelmetIntelState[] {
  const focusNode = graphRoute.at(-1) || '启动舱';
  const routeTrail = graphRoute.length > 1 ? graphRoute.slice(-3).join(' > ') : '母节点 > 行业环 > 任务外圈';
  const detectedAgents = recommendedAgents
    .map((agent) => String(agent.agent_name || agent.name || agent.stage || '').trim())
    .filter((label) => label.length > 0)
    .slice(0, 3);
  const detectedTopic =
    detectedAgents.length > 0
      ? `${detectedAgents.join(' / ')} 协同`
      : graphRoute.length > 0
        ? graphRoute.slice(-2).join(' / ')
        : '行业图谱、痛点任务与智能体能力';
  const agentLine = detectedAgents.length > 0 ? detectedAgents.join('、') : '本地候选智能体';
  const streamingHint = status === 'streaming' ? '实时推演中' : status === 'completed' ? '推演完成' : '待命';

  return [
    {
      channel: 'ORBIT ARRIVAL',
      copy: `来到了中隐会图谱星球 · ${focusNode}。轨道入口已打开，正在读取母节点、行业环与外圈任务信号。`,
      id: 'orbit-arrival',
      metaLeft: 'ZHONGYINHUI ORBIT',
      metaRight: 'GRAPH PLANET',
      tone: 'active',
    },
    {
      channel: 'MECH STATUS',
      copy: `机甲状态：反应堆 97%，头盔 HUD 在线，外骨骼边缘装甲锁定。左下控制台保持低功耗待命。`,
      id: 'mech-status',
      metaLeft: 'ARMOR TELEMETRY',
      metaRight: voiceAwake ? 'PILOT LINKED' : 'STANDBY',
      tone: voiceAwake ? 'active' : 'nominal',
    },
    {
      channel: 'COSMIC WEATHER',
      copy: `宇宙信息：蓝金粒子潮汐稳定，图谱星尘密度上升。当前窗口适合展开关系扫描和路径生成。`,
      id: 'cosmic-weather',
      metaLeft: 'DEEP SPACE DATA',
      metaRight: 'PARTICLE TIDE',
      tone: 'nominal',
    },
    {
      channel: 'GRAPH SCAN',
      copy: `图谱扫描：${routeTrail}。当前焦点落在「${focusNode}」，正在估计可触发的痛点、任务和智能体能力。`,
      id: 'graph-scan',
      metaLeft: 'LOCAL GRAPH',
      metaRight: graphRoute.length > 0 ? 'PATH LOCK' : 'SEEKING',
      tone: graphRoute.length > 0 ? 'active' : 'nominal',
    },
    {
      channel: 'SCRIPT RADAR',
      copy: `话术雷达：检测到 ${detectedTopic} 相关话术。建议优先输出场景切入、痛点确认、方案承接三段式表达。`,
      id: 'script-radar',
      metaLeft: 'SCRIPT TRACE',
      metaRight: streamingHint.toUpperCase(),
      tone: status === 'streaming' ? 'active' : 'nominal',
    },
    {
      channel: 'COMMS LINK',
      copy: `通信链路：${voiceAwake ? '语音链路已接入，座舱正在监听驾驶员指令。' : '语音链路待命，可通过 Jarvis 唤醒。'}文本链路保持同步，随时可以进入智能体推荐。`,
      id: 'comms-link',
      metaLeft: 'ARMOR COMMS',
      metaRight: voiceAwake ? 'VOICE READY' : 'LOCAL INTEL',
      tone: voiceAwake ? 'active' : 'nominal',
    },
    {
      channel: 'AGENT ARRAY',
      copy: `智能体阵列：${agentLine} 已进入候选序列。系统会根据图谱节点继续匹配增长、成交和主力阵容。`,
      id: 'agent-array',
      metaLeft: 'HERO ARRAY',
      metaRight: recommendedAgents.length > 0 ? `${recommendedAgents.length} AGENTS` : 'SCANNING',
      tone: recommendedAgents.length > 0 ? 'active' : 'nominal',
    },
    {
      channel: 'RISK RADAR',
      copy: status === 'error'
        ? '风险雷达：外部链路异常，已切换本地估计话术和缓存路径。建议重新发送指令或保持当前图谱焦点。'
        : '风险雷达：未发现阻断信号。当前路径可继续推进，建议保留父级锚点并逐层点亮下一圈节点。',
      id: 'risk-radar',
      metaLeft: 'THREAT MODEL',
      metaRight: status === 'error' ? 'LINK ALERT' : 'CLEAR',
      tone: status === 'error' ? 'warning' : 'nominal',
    },
  ];
}

export default function App() {
  const demoGraphEnabled = new URLSearchParams(window.location.search).has('demoGraph');
  const speechCaptionTimerRef = useRef<number | null>(null);
  const speechEndTimerRef = useRef<number | null>(null);
  const speechOutputActiveRef = useRef(false);
  const speechSessionRef = useRef(0);
  const voiceControlRef = useRef<{ pause: () => void; resume: () => void; stop: () => void } | null>(null);
  const micLevelRef = useRef<{ start: () => Promise<void>; stop: () => void } | null>(null);
  const lastSpeechPulseAtRef = useRef(0);
  const agentRequestRef = useRef<AbortController | null>(null);
  const agentConversationIdsRef = useRef<AgentConversationIds>(createClientConversationIds());
  const lastHeroHallAutoKeyRef = useRef('');
  const [settings, setSettings] = useState<ParticleSettings>(baseSettings);
  const [, setReplySource] = useState<ReplySource>('local-mock');
  const [, setConversationIdsVersion] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [agentTurns, setAgentTurns] = useState<AgentTurn[]>([]);
  const [heroHallOpen, setHeroHallOpen] = useState(false);
  const [heroHallLineupState, setHeroHallLineupState] = useState<HeroHallLineupsState>(() => createHeroHallLineups());
  const [pinnedRecommendedAgents, setPinnedRecommendedAgents] = useState<RecommendedAgent[]>([]);
  const [routeDockVisible, setRouteDockVisible] = useState(demoGraphEnabled);
  const [recommendationDockVisible, setRecommendationDockVisible] = useState(false);
  const [workflowHighlight, setWorkflowHighlight] = useState<WorkflowHighlight>('none');
  const [draft, setDraft] = useState('');
  const [inputMode, setInputMode] = useState<InputMode>('voice');
  const [interfaceLanguage, setInterfaceLanguage] = useState<ConversationLanguage>('zh-CN');
  const [lastAction, setLastAction] = useState<AgentAction | null>(demoGraphEnabled ? demoGraphAction : null);
  const [lastHeard, setLastHeard] = useState('');
  const [manualVoiceSession, setManualVoiceSession] = useState(false);
  const recognitionLanguage: ConversationLanguage = 'zh-CN';
  const [currentSpeechText, setCurrentSpeechText] = useState('');
  const [speechError, setSpeechError] = useState('');
  const [voiceAwake, setVoiceAwake] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, speaker: 'ai', text: '晚上好，先生。系统已上线，正在待命。' },
  ]);

  const rememberConversationIds = useCallback((event: AgentStreamEvent) => {
    const nextConversationIds = mergeConversationIdsFromEvent(agentConversationIdsRef.current, event);

    if (nextConversationIds === agentConversationIdsRef.current) {
      return;
    }

    agentConversationIdsRef.current = nextConversationIds;
    setConversationIdsVersion((version) => version + 1);
  }, []);

  const clearSpeechEndTimer = useCallback(() => {
    if (speechEndTimerRef.current !== null) {
      window.clearTimeout(speechEndTimerRef.current);
      speechEndTimerRef.current = null;
    }
  }, []);

  const clearSpeechCaptionTimer = useCallback(() => {
    if (speechCaptionTimerRef.current !== null) {
      window.clearTimeout(speechCaptionTimerRef.current);
      speechCaptionTimerRef.current = null;
    }
  }, []);

  const startSpeechCaption = useCallback(
    (displayText: string, speechSessionId: number) => {
      clearSpeechCaptionTimer();
      setCurrentSpeechText('');

      const normalizedDisplayText = displayText.trim();

      if (!normalizedDisplayText) {
        return;
      }

      const chunkSize = normalizedDisplayText.length > 150 ? 5 : normalizedDisplayText.length > 72 ? 4 : 3;
      let cursor = 0;

      const tick = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        cursor = Math.min(normalizedDisplayText.length, cursor + chunkSize);
        setCurrentSpeechText(normalizedDisplayText.slice(0, cursor));

        if (cursor < normalizedDisplayText.length) {
          speechCaptionTimerRef.current = window.setTimeout(tick, 26);
        } else {
          speechCaptionTimerRef.current = null;
        }
      };

      tick();
    },
    [clearSpeechCaptionTimer],
  );

  const beginSpeechOutput = useCallback(() => {
    clearSpeechEndTimer();
    speechOutputActiveRef.current = true;
    lastSpeechPulseAtRef.current = performance.now();
    setSettings((current) => ({ ...current, energy: 1, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
  }, [clearSpeechEndTimer]);

  const pulseSpeechOutput = useCallback(() => {
    const now = performance.now();

    if (now - lastSpeechPulseAtRef.current < 420) {
      return;
    }

    lastSpeechPulseAtRef.current = now;
    setSettings((current) => ({ ...current, energy: 1, mode: 'speaking', pulseSeed: current.pulseSeed + 1 }));
  }, []);

  const finishSpeechOutput = useCallback(() => {
    clearSpeechEndTimer();
    clearSpeechCaptionTimer();
    speechOutputActiveRef.current = false;
    setCurrentSpeechText('');
    setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));
  }, [clearSpeechCaptionTimer, clearSpeechEndTimer]);

  const speakWithParticleOutput = useCallback(
    (text: string, options: SpeechOutputOptions = {}) => {
      const shouldResumeListening = options.resumeListening ?? true;
      const speechSessionId = speechSessionRef.current + 1;
      speechSessionRef.current = speechSessionId;

      setSpeechError('');
      startSpeechCaption(options.displayText ?? text, speechSessionId);
      voiceControlRef.current?.pause();
      beginSpeechOutput();

      const estimatedDuration = Math.min(15000, Math.max(5600, text.length * 92));
      const startedAt = performance.now();
      const settleSpeechOutput = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        finishSpeechOutput();
        if (shouldResumeListening) {
          setSettings((current) => ({
            ...current,
            energy: 0.82,
            mode: 'listening',
            pulseSeed: current.pulseSeed + 1,
          }));
          window.setTimeout(() => {
            void micLevelRef.current?.start();
            voiceControlRef.current?.resume();
          }, 260);
        }

        options.onSettled?.();
      };
      const finishAfterMinimum = () => {
        if (speechSessionId !== speechSessionRef.current) {
          return;
        }

        const elapsed = performance.now() - startedAt;
        const minimumVisualDuration = options.minimumVisualDurationMs ?? Math.min(estimatedDuration, 5200);
        const remaining = Math.max(0, minimumVisualDuration - elapsed);

        clearSpeechEndTimer();
        speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, remaining);
      };
      const queued = speak(
        text,
        {
          onEnd: finishAfterMinimum,
          onError: (reason) => {
            if (speechSessionId === speechSessionRef.current) {
              setSpeechError(reason);
            }
          },
          onPulse: () => {
            if (speechSessionId === speechSessionRef.current) {
              pulseSpeechOutput();
            }
          },
          onStart: () => {
            if (speechSessionId === speechSessionRef.current) {
              beginSpeechOutput();
            }
          },
        },
        options.audioBlob,
      );

      speechEndTimerRef.current = window.setTimeout(settleSpeechOutput, queued ? estimatedDuration + 30000 : 5200);
    },
    [beginSpeechOutput, clearSpeechEndTimer, finishSpeechOutput, pulseSpeechOutput, startSpeechCaption],
  );

  const finishReplyWithoutSpeech = useCallback(
    (shouldResumeListening: boolean) => {
      clearSpeechEndTimer();
      clearSpeechCaptionTimer();
      speechOutputActiveRef.current = false;
      setCurrentSpeechText('');
      setSpeechError('');
      setSettings((current) => ({ ...current, energy: 0.38, mode: 'idle' }));

      if (shouldResumeListening) {
        window.setTimeout(() => {
          void micLevelRef.current?.start();
          voiceControlRef.current?.resume();
        }, 260);
      }
    },
    [clearSpeechCaptionTimer, clearSpeechEndTimer],
  );

  const submitMessage = useCallback(
    async (raw: string, options: SubmitMessageOptions = {}) => {
      const text = raw.trim();

      if (!text) {
        return;
      }

      if (agentStatus === 'streaming' || agentRequestRef.current) {
        return;
      }

      const shouldResumeListening = options.resumeListening ?? (inputMode === 'voice' && (voiceAwake || manualVoiceSession));
      const now = Date.now();
      const nextUserMessage: Message = { id: now, speaker: 'you', text };
      const turnId = `turn-${now}`;
      const controller = new AbortController();
      const history = [...messages, nextUserMessage];
      agentConversationIdsRef.current = ensureClientConversationIds(agentConversationIdsRef.current);
      const conversationIdsForRequest = { ...agentConversationIdsRef.current };
      const latestRecommendedAgentsForState = getLatestDisplayableRecommendedAgents(agentTurns);
      const recommendedAgentsForLineupState =
        latestRecommendedAgentsForState.length > 0 ? latestRecommendedAgentsForState : pinnedRecommendedAgents;
      const lineupStateForRequest = buildHeroHallLineupUserState(heroHallLineupState, recommendedAgentsForLineupState);
      const userStateForRequest = mergeAgentUserState(getLatestAgentUserState(agentTurns), lineupStateForRequest);
      const requestedLineupForRequest = detectRequestedLineupFromText(text);

      agentRequestRef.current = controller;
      voiceControlRef.current?.pause();
      micLevelRef.current?.stop();
      setDraft('');
      setReplySource('coze-stream');
      setAgentStatus('streaming');
      setLastHeard('');
      setWorkflowHighlight('none');
      setAgentTurns((current) => [...current.slice(-9), createAgentTurn(turnId, text)]);
      setMessages((current) => [
        ...current.slice(-18),
        nextUserMessage,
        { id: now + 1, speaker: 'ai', text: 'Processing...' },
      ]);
      setSettings((current) => ({ ...current, energy: 0.82, mode: 'thinking', pulseSeed: current.pulseSeed + 1 }));

      let accumulatedWorkflow = setWorkflowLineupIntent(createEmptyAgentWorkflow(), requestedLineupForRequest);
      let revealState: WorkflowRevealState = { ...createEmptyWorkflowRevealState(), knowledgeAck: true };
      let cardsCompleted = false;
      let routeActionReady = false;
      let committedRouteAction: AgentAction | null = null;
      let routeKey = '';
      let hasSeenKnowledgePath = false;
      let streamError = '';
      let speechSegmentsClosed = false;
      let playedSpeechInTurn = false;
      let requestedLineupForResponse = requestedLineupForRequest;
      let appliedLineupFallback = false;
      const cardReadyWaiters: Array<(ready: boolean) => void> = [];
      const routeActionWaiters: Array<(action: AgentAction | null) => void> = [];
      const speechAssets = new Map<SpeechSegmentKey, PreloadedSpeechAsset>();
      const speechWaiters = new Map<SpeechSegmentKey, Array<(asset: PreloadedSpeechAsset | null) => void>>();
      const textOverrides: WorkflowTextOverrides = new Map();
      let agentRevealCount: number | null = null;
      const publishVisibleWorkflow = () => {
        const visibleWorkflow = getVisibleWorkflow(accumulatedWorkflow, revealState, textOverrides, agentRevealCount);
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, workflow: visibleWorkflow })));
      };
      const commitWorkflow = (workflow: AgentWorkflow) => {
        accumulatedWorkflow = workflow;
        publishVisibleWorkflow();
      };
      const revealWorkflow = (nextReveal: Partial<WorkflowRevealState>) => {
        revealState = { ...revealState, ...nextReveal };
        publishVisibleWorkflow();
      };
      const isSpeechSegmentVisible = (segment: SpeechSegmentKey) => {
        if (segment === 'knowledgeAck') {
          return revealState.knowledgeAck;
        }

        if (segment === 'knowledgeExplanation') {
          return revealState.knowledgeExplanation;
        }

        if (segment === 'recommendationAck') {
          return revealState.recommendationAck;
        }

        return revealState.recommendationSummary;
      };
      const replayBufferedText = async (key: WorkflowTextKey, text: string) => {
        const normalizedText = text.trim();

        if (!normalizedText) {
          textOverrides.delete(key);
          publishVisibleWorkflow();
          return;
        }

        const chunkSize = normalizedText.length > 140 ? 5 : normalizedText.length > 72 ? 4 : 3;

        for (let index = chunkSize; index < normalizedText.length; index += chunkSize) {
          if (controller.signal.aborted) {
            return;
          }

          textOverrides.set(key, normalizedText.slice(0, index));
          publishVisibleWorkflow();
          await wait(24);
        }

        textOverrides.delete(key);
        publishVisibleWorkflow();
      };
      const revealSpeechSegment = (segment: SpeechSegmentKey, text: string) => {
        const alreadyVisible = isSpeechSegmentVisible(segment);
        const textKey = getTextKeyForSpeechSegment(segment);

        if (!alreadyVisible) {
          textOverrides.set(textKey, '');
        }

        revealWorkflow(getRevealForSpeechSegment(segment));

        if (!alreadyVisible) {
          void replayBufferedText(textKey, text);
        }
      };
      const commitRouteAction = (routeText: string) => {
        const routeAction = getActionFromRoute(routeText);

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return;
        }

        const nextRouteKey = routeAction.route.join('/');

        if (nextRouteKey === routeKey) {
          return;
        }

        routeKey = nextRouteKey;
        routeActionReady = true;
        committedRouteAction = routeAction;
        routeActionWaiters.splice(0).forEach((resolve) => resolve(routeAction));
      };
      const commitKnowledgePathIfReady = () => {
        if (!hasSeenKnowledgePath || routeActionReady) {
          return;
        }

        commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
      };
      const commitTurnError = (error: string) => {
        streamError = error;
        setAgentStatus('error');
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, error, status: 'error' })));
      };
      const preloadSpeechSegment = (segment: SpeechSegmentKey) => {
        if (getTtsMode() === 'browser') {
          return;
        }

        const segmentText = getSpeechTextForSegment(accumulatedWorkflow, segment);

        if (!segmentText) {
          return;
        }

        const existing = speechAssets.get(segment);
        if (existing?.text === segmentText) {
          return;
        }

        const asset: PreloadedSpeechAsset = {
          audioPromise: requestTtsAudio(segmentText),
          text: segmentText,
        };
        speechAssets.set(segment, asset);
        speechWaiters.get(segment)?.splice(0).forEach((resolve) => resolve(asset));
      };
      const waitForSpeechSegment = (segment: SpeechSegmentKey) => {
        const existing = speechAssets.get(segment);

        if (existing) {
          return Promise.resolve(existing);
        }

        if (speechSegmentsClosed) {
          return Promise.resolve(null);
        }

        return new Promise<PreloadedSpeechAsset | null>((resolve) => {
          const timer = window.setTimeout(() => resolve(null), SPEECH_SEGMENT_WAIT_MS);
          const resolveOnce = (asset: PreloadedSpeechAsset | null) => {
            window.clearTimeout(timer);
            resolve(asset);
          };
          const waiters = speechWaiters.get(segment) || [];
          waiters.push(resolveOnce);
          speechWaiters.set(segment, waiters);
        });
      };
      const closeSpeechSegments = () => {
        speechSegmentsClosed = true;
        speechWaiters.forEach((waiters) => waiters.splice(0).forEach((resolve) => resolve(null)));
      };
      const playSpeechSegment = async (segment: SpeechSegmentKey) => {
        const asset = await waitForSpeechSegment(segment);
        const speechText = asset?.text || getSpeechTextForSegment(accumulatedWorkflow, segment);

        if (!speechText) {
          return;
        }

        playedSpeechInTurn = true;
        revealSpeechSegment(segment, speechText);

        const audioBlob = asset
          ? await asset.audioPromise.catch((error) => {
              if (!isFallbackableTtsError(error)) {
                setSpeechError(error instanceof Error ? error.message : 'TTS preload failed.');
              }
              return null;
            })
          : undefined;

        await new Promise<void>((resolve) => {
          speakWithParticleOutput(speechText, {
            audioBlob: audioBlob ?? undefined,
            displayText: speechText,
            minimumVisualDurationMs: 0,
            onSettled: resolve,
            resumeListening: false,
          });
        });
      };
      const waitForRouteAction = () => {
        if (committedRouteAction) {
          return Promise.resolve(committedRouteAction);
        }

        return new Promise<AgentAction | null>((resolve) => {
          routeActionWaiters.push(resolve);
        });
      };
      const closeRouteAction = () => {
        if (routeActionWaiters.length === 0) {
          return;
        }

        routeActionWaiters.splice(0).forEach((resolve) => resolve(getActionFromRoute(accumulatedWorkflow.knowledgeGraph.KG_PATH)));
      };
      const markCardsReady = () => {
        cardsCompleted = true;
        cardReadyWaiters.splice(0).forEach((resolve) => resolve(true));
      };
      const markCardsReadyIfAvailable = () => {
        if (accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          markCardsReady();
        }
      };
      const applyLineupFallbackAgents = (lineupId: HeroHallLineupId) => {
        if (appliedLineupFallback && requestedLineupForResponse === lineupId) {
          return;
        }

        const fallbackAgents = getCatalogAgentsForLineup(lineupId);

        if (fallbackAgents.length === 0) {
          return;
        }

        appliedLineupFallback = true;
        requestedLineupForResponse = lineupId;
        commitWorkflow(setWorkflowLineupIntent(replaceRecommendedAgents(accumulatedWorkflow, fallbackAgents), lineupId));
        agentRevealCount = null;
        revealWorkflow({ recommendationAgents: true });
        setHeroHallLineupState((current) =>
          mergeHeroHallLineups(
            current,
            createHeroHallLineupsFromAgents(
              fallbackAgents.map((agent) => ({
                agent,
                key: getHeroHallAgentKey(agent),
              })),
            ),
          ),
        );
        setHeroHallOpen(true);
        setRecommendationDockVisible(true);
        setWorkflowHighlight('agents');
        markCardsReady();
      };
      const closeCardsReady = () => {
        const hasCards = accumulatedWorkflow.agentRecommendation.agents.length > 0;

        if (hasCards) {
          cardsCompleted = true;
        }

        cardReadyWaiters.splice(0).forEach((resolve) => resolve(hasCards));
      };
      const waitForCardsReady = () => {
        if (cardsCompleted || accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          return Promise.resolve(true);
        }

        return new Promise<boolean>((resolve) => {
          const timer = window.setTimeout(() => resolve(false), SPEECH_SEGMENT_WAIT_MS);
          cardReadyWaiters.push((ready) => {
            window.clearTimeout(timer);
            resolve(ready);
          });
        });
      };
      const activatePathAnimation = async () => {
        const routeAction = await waitForRouteAction();

        if (!routeAction || routeAction.type !== 'focus_graph_path') {
          return false;
        }

        revealWorkflow({ knowledgePath: true });
        setLastAction(routeAction);
        setRouteDockVisible(true);
        setWorkflowHighlight('route');
        return true;
      };
      const runCardAnimation = async () => {
        const hasCards = await waitForCardsReady();

        if (!hasCards) {
          return;
        }

        if (revealState.recommendationAgents) {
          agentRevealCount = null;
          publishVisibleWorkflow();
          await wait(RECOMMENDATION_DOCK_REVEAL_MS);
          return;
        }

        agentRevealCount = 1;
        revealWorkflow({ recommendationAgents: true });
        setRecommendationDockVisible(true);
        setWorkflowHighlight('agents');

        while (agentRevealCount < accumulatedWorkflow.agentRecommendation.agents.length) {
          if (controller.signal.aborted) {
            return;
          }

          await wait(260);
          agentRevealCount += 1;
          publishVisibleWorkflow();
        }

        agentRevealCount = null;
        publishVisibleWorkflow();
        await wait(RECOMMENDATION_DOCK_REVEAL_MS);
      };
      const revealCompletedWorkflow = () => {
        revealWorkflow({
          knowledgeAck: true,
          knowledgeExplanation: true,
          knowledgePath: true,
          recommendationAck: true,
          recommendationAgents: true,
          recommendationSummary: true,
        });
      };
      const orchestrationPromise = (async () => {
        await playSpeechSegment('knowledgeAck');
        const pathAnimationActive = await activatePathAnimation();
        if (pathAnimationActive) {
          await Promise.all([playSpeechSegment('knowledgeExplanation'), wait(PATH_MATCH_ANIMATION_MS)]);
        } else {
          await playSpeechSegment('knowledgeExplanation');
        }
        setWorkflowHighlight('none');
        await playSpeechSegment('recommendationAck');
        await Promise.all([playSpeechSegment('recommendationSummary'), runCardAnimation()]);
        setWorkflowHighlight('none');
        revealCompletedWorkflow();
        if (!playedSpeechInTurn) {
          const fallbackSpeechText = cleanSpeechText(buildAgentReplyText(accumulatedWorkflow, ''));

          if (fallbackSpeechText) {
            playedSpeechInTurn = true;
            await new Promise<void>((resolve) => {
              speakWithParticleOutput(fallbackSpeechText.slice(0, 220), {
                displayText: fallbackSpeechText,
                minimumVisualDurationMs: 0,
                onSettled: resolve,
                resumeListening: false,
              });
            });
          }
        }
      })();

      try {
        await streamAgentChat(text, {
          autoSaveHistory: true,
          conversationId: conversationIdsForRequest.route_planner,
          conversationIds: conversationIdsForRequest,
          requestedLineup: requestedLineupForRequest,
          signal: controller.signal,
          userState: userStateForRequest,
          onEvent(event) {
            rememberConversationIds(event);

            const speechSegment = getCompletedSpeechSegment(event);

            if (speechSegment) {
              preloadSpeechSegment(speechSegment);
              return;
            }
          },
          onCompleted(event) {
            rememberConversationIds(event);
            commitKnowledgePathIfReady();
          },
          onContentDelta(event) {
            const lineupIntent = getLineupIntentFromEvent(event);

            if (lineupIntent) {
              requestedLineupForResponse = lineupIntent;
              commitWorkflow(setWorkflowLineupIntent(accumulatedWorkflow, lineupIntent));
              applyLineupFallbackAgents(lineupIntent);
            }

            const section = getWorkflowSection(event);

            if (!section) {
              return;
            }

            const nextWorkflow = appendWorkflowContent(accumulatedWorkflow, section, event.type, event.content || '');
            commitWorkflow(nextWorkflow);

            if (event.stage === 'knowledge_graph' && event.type === 'KG_PATH') {
              hasSeenKnowledgePath = true;
              return;
            }

            commitKnowledgePathIfReady();
          },
          onGraphPathResolved(event) {
            const graphPath = {
              ...event,
              route: String(event.route || accumulatedWorkflow.knowledgeGraph.KG_PATH || ''),
            } as AgentGraphPath;
            const nextWorkflow = setWorkflowGraphPath(accumulatedWorkflow, graphPath);
            commitWorkflow(nextWorkflow);
            commitRouteAction(graphPath.route || '');
          },
          onRecommendedAgentStarted(event) {
            commitKnowledgePathIfReady();
            const agentIndex = typeof event.agent_index === 'number' ? event.agent_index : undefined;
            const nextWorkflow = upsertRecommendedAgent(
              accumulatedWorkflow,
              agentIndex === undefined ? undefined : { agent_index: agentIndex },
              { streamStatus: 'streaming' },
            );
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgent(agent, event) {
            commitKnowledgePathIfReady();
            const delta = event.delta as { field?: string } | undefined;
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: typeof delta?.field === 'string' ? delta.field : null,
              streamStatus: 'streaming',
            });
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgentCompleted(agent) {
            commitKnowledgePathIfReady();
            const nextWorkflow = upsertRecommendedAgent(accumulatedWorkflow, agent, {
              activeField: null,
              streamStatus: 'completed',
            });
            commitWorkflow(nextWorkflow);
            markCardsReadyIfAvailable();
          },
          onRecommendedAgentsCompleted(agents) {
            commitKnowledgePathIfReady();
            const normalizedAgents = requestedLineupForResponse
              ? agents.map((agent) => ({
                  ...agent,
                  lineup: getRecommendedAgentLineup(agent) || requestedLineupForResponse,
                }))
              : agents;

            if (normalizedAgents.length > 0) {
              appliedLineupFallback = false;
            }

            commitWorkflow(
              setWorkflowLineupIntent(
                replaceRecommendedAgents(accumulatedWorkflow, normalizedAgents),
                requestedLineupForResponse,
              ),
            );
            markCardsReady();
          },
          onWorkflowError(event) {
            commitKnowledgePathIfReady();
            commitTurnError(formatWorkflowError(event));
          },
        });

        if (!routeActionReady) {
          commitRouteAction(accumulatedWorkflow.knowledgeGraph.KG_PATH);
        }
        if (accumulatedWorkflow.agentRecommendation.agents.length === 0 && requestedLineupForResponse) {
          applyLineupFallbackAgents(requestedLineupForResponse);
        }
        if (accumulatedWorkflow.agentRecommendation.agents.length > 0) {
          markCardsReady();
        } else {
          closeCardsReady();
        }
        closeSpeechSegments();
        closeRouteAction();

        const finalText = buildAgentReplyText(accumulatedWorkflow, streamError || 'Agent 已完成，但没有返回可展示内容。');
        const finalStatus: AgentStatus = streamError ? 'error' : 'completed';
        setMessages((current) => {
          const withoutThinking = current.filter((message) => message.text !== 'Processing...');
          return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: finalText }];
        });
        setAgentStatus(finalStatus);
        setAgentTurns(updateTurnById(turnId, (turn) => ({ ...turn, status: finalStatus })));
        void orchestrationPromise.finally(() => {
          finishReplyWithoutSpeech(shouldResumeListening);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          closeSpeechSegments();
          closeRouteAction();
          closeCardsReady();
          setWorkflowHighlight('none');
          return;
        }

        closeSpeechSegments();
        closeRouteAction();
        closeCardsReady();
        setWorkflowHighlight('none');

        try {
          const response = await requestAIReply(text, history);
          setReplySource(response.source);
          setAgentStatus('completed');
          setLastAction(response.actions[0] ?? null);
          setAgentTurns(
            updateTurnById(turnId, (turn) => ({
              ...turn,
              fallbackText: response.text,
              source: response.source,
              status: 'completed',
            })),
          );
          setMessages((current) => {
            const withoutThinking = current.filter((message) => message.text !== 'Processing...');
            return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: response.text }];
          });
          const speechText = extractAckSpeechText(response.spokenText ?? response.text);
          if (speechText) {
            speakWithParticleOutput(speechText, {
              displayText: speechText,
              resumeListening: shouldResumeListening,
            });
          } else {
            finishReplyWithoutSpeech(shouldResumeListening);
          }
        } catch {
          const fallback =
            error instanceof Error && error.message
              ? `智能体接口连接失败：${error.message}`
              : '智能体接口连接失败，本地操作仍保持在线。';

          setReplySource('local-mock');
          setAgentStatus('error');
          setLastAction({ type: 'chat' });
          setAgentTurns(
            updateTurnById(turnId, (turn) => ({
              ...turn,
              error: fallback,
              fallbackText: fallback,
              source: 'local-mock',
              status: 'error',
            })),
          );
          setMessages((current) => {
            const withoutThinking = current.filter((message) => message.text !== 'Processing...');
            return [...withoutThinking.slice(-19), { id: Date.now(), speaker: 'ai', text: fallback }];
          });
          const speechText = extractAckSpeechText(fallback);
          if (speechText) {
            speakWithParticleOutput(speechText, { displayText: speechText, resumeListening: shouldResumeListening });
          } else {
            finishReplyWithoutSpeech(shouldResumeListening);
          }
        }
      } finally {
        if (agentRequestRef.current === controller) {
          agentRequestRef.current = null;
        }
      }
    },
    [
      agentStatus,
      agentTurns,
      finishReplyWithoutSpeech,
      heroHallLineupState,
      inputMode,
      manualVoiceSession,
      messages,
      pinnedRecommendedAgents,
      rememberConversationIds,
      speakWithParticleOutput,
      voiceAwake,
    ],
  );

  const handleVoiceCommand = useCallback(
    (raw: string) => {
      const text = raw.trim();

      if (agentStatus === 'streaming' || agentRequestRef.current) {
        voiceControlRef.current?.pause();
        micLevelRef.current?.stop();
        setLastHeard('');
        return;
      }

      if (!text || speechOutputActiveRef.current) {
        return;
      }

      setLastHeard(text);
      setInputMode('voice');
      const inputLanguage = detectConversationLanguage(text);
      setInterfaceLanguage(inputLanguage);

      if (wantsSleep(text)) {
        setManualVoiceSession(false);
        setVoiceAwake(false);
        setLastAction(null);
        setLastHeard('');
        voiceControlRef.current?.stop();
        micLevelRef.current?.stop();
        setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
        return;
      }

      const wakeCommand = extractWakeCommand(text);

      if (!voiceAwake) {
        setManualVoiceSession(false);
        setVoiceAwake(true);

        if (wakeCommand?.command) {
          void submitMessage(wakeCommand.command, { resumeListening: true });
          return;
        }

        if (!wakeCommand) {
          void submitMessage(text, { resumeListening: true });
          return;
        }

        return;
      }

      void submitMessage(wakeCommand?.command || text, { resumeListening: true });
    },
    [agentStatus, speakWithParticleOutput, submitMessage, voiceAwake],
  );

  const voice = useVoiceControl(handleVoiceCommand, recognitionLanguage);
  voiceControlRef.current = { pause: voice.pause, resume: voice.resume, stop: voice.stop };
  const micLevel = useMicLevel();
  micLevelRef.current = { start: micLevel.start, stop: micLevel.stop };

  useEffect(() => {
    primeSpeechOutput();
    return () => {
      agentRequestRef.current?.abort();
      clearSpeechEndTimer();
      cancelSpeechPlayback();
    };
  }, [clearSpeechEndTimer]);

  const toggleManualVoiceSession = useCallback(() => {
    if (!voice.supported) {
      return;
    }

    primeSpeechOutput();
    setInputMode('voice');

    if (manualVoiceSession || voiceAwake) {
      speechSessionRef.current += 1;
      clearSpeechEndTimer();
      speechOutputActiveRef.current = false;
      cancelSpeechPlayback();
      window.speechSynthesis?.cancel();
      setManualVoiceSession(false);
      setVoiceAwake(false);
      setLastAction(null);
      setLastHeard('');
      setCurrentSpeechText('');
      setSpeechError('');
      voice.stop();
      micLevel.stop();
      setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
      speakWithParticleOutput('语音链路已关闭，先生。', {
        displayText: 'Jarvis 语音链路已关闭。',
        minimumVisualDurationMs: 900,
        resumeListening: false,
      });
      return;
    }

    setManualVoiceSession(true);
    setVoiceAwake(true);
    setLastAction(null);
    setLastHeard('');
    voice.stop();
    setSettings((current) => ({ ...current, energy: 0.82, mode: 'listening', pulseSeed: current.pulseSeed + 1 }));
    speakWithParticleOutput('系统上线，先生。语音链路已接入。', {
      displayText: 'Jarvis 语音链路已接入。',
      minimumVisualDurationMs: 1200,
      resumeListening: true,
    });

  }, [clearSpeechEndTimer, manualVoiceSession, micLevel, speakWithParticleOutput, voice, voiceAwake]);

  const switchInputMode = useCallback(
    (nextMode: InputMode) => {
      setInputMode(nextMode);

      if (nextMode !== 'text') {
        return;
      }

      speechSessionRef.current += 1;
      clearSpeechEndTimer();
      speechOutputActiveRef.current = false;
      cancelSpeechPlayback();
      window.speechSynthesis?.cancel();
      setManualVoiceSession(false);
      setVoiceAwake(false);
      setLastHeard('');
      setCurrentSpeechText('');
      setSpeechError('');
      voice.stop();
      micLevel.stop();
      setSettings((current) => ({ ...current, energy: 0.34, mode: 'idle', pulseSeed: current.pulseSeed + 1 }));
    },
    [clearSpeechEndTimer, micLevel, voice],
  );

  const sendDraftMessage = useCallback(
    () => {
      void submitMessage(draft, { resumeListening: false });
    },
    [draft, submitMessage],
  );

  const handleDraftKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }

      event.preventDefault();
      void submitMessage(draft, { resumeListening: false });
    },
    [draft, submitMessage],
  );

  const latestDisplayableRecommendedAgents = getLatestDisplayableRecommendedAgents(agentTurns);
  const recommendedAgents =
    latestDisplayableRecommendedAgents.length > 0 ? latestDisplayableRecommendedAgents : pinnedRecommendedAgents;
  const fallbackRoute = getLatestRouteSegments(agentTurns);
  const graphRoute = lastAction?.type === 'focus_graph_path' ? lastAction.route : fallbackRoute;
  const dockRouteSegments = routeDockVisible && graphRoute.length > 0 ? graphRoute : [];
  const dockRecommendedAgents = recommendationDockVisible ? recommendedAgents : [];
  const graphFocusKey =
    graphRoute.length > 0
      ? `${lastAction?.type === 'focus_graph_path' ? lastAction.label : graphRoute.at(-1)}:${graphRoute.join('/')}`
      : '';
  const heroHallSummary = getLatestRecommendationSummary(agentTurns);
  const heroHallKey = recommendedAgents.map(getRecommendedAgentKey).join('|');
  const heroHallReady = agentStatus === 'completed' && recommendedAgents.length > 0 && Boolean(heroHallSummary);
  const readoutText =
    settings.mode === 'thinking'
      ? isChineseLanguage(interfaceLanguage)
        ? '思考中...'
        : 'Thinking...'
      : settings.mode === 'speaking'
        ? currentSpeechText
        : '';
  const voiceCaptionError = inputMode === 'text' ? '' : speechError || voice.error || micLevel.error;
  const captionText =
    voiceCaptionError ||
    (inputMode === 'text'
      ? ''
      : voice.listening
        ? voiceAwake
          ? lastHeard
            ? isChineseLanguage(interfaceLanguage)
              ? `语音模式已激活。听到：${lastHeard}`
              : `Voice mode active. Heard: ${lastHeard}`
            : isChineseLanguage(interfaceLanguage)
              ? '语音模式已激活，可以直接说。'
              : 'Voice mode active. Speak naturally.'
        : isChineseLanguage(interfaceLanguage)
          ? '说“贾维斯”唤醒语音模式。'
          : 'Say "Jarvis" to wake voice mode.'
      : isChineseLanguage(interfaceLanguage)
        ? '语音待命。'
        : 'Voice standby.');

  useEffect(() => {
    if (latestDisplayableRecommendedAgents.length > 0) {
      setPinnedRecommendedAgents(latestDisplayableRecommendedAgents);
    }
  }, [latestDisplayableRecommendedAgents]);

  useEffect(() => {
    if (!heroHallReady || !heroHallKey || lastHeroHallAutoKeyRef.current === heroHallKey) {
      return undefined;
    }

    lastHeroHallAutoKeyRef.current = heroHallKey;
    const timer = window.setTimeout(() => setHeroHallOpen(true), 620);

    return () => window.clearTimeout(timer);
  }, [heroHallKey, heroHallReady]);

  return (
    <main className="app-shell" data-hero-hall={heroHallOpen}>
      {!heroHallOpen ? (
        <ParticleField
          audioLevel={micLevel.level}
          graphFocusKey={graphFocusKey}
          graphRoute={graphRoute}
          settings={settings}
        />
      ) : null}
      <div className="scene-vignette" />
      {!heroHallOpen ? (
        <JarvisHelmetHud
          inputMode={inputMode}
          status={agentStatus}
          voiceAwake={voiceAwake}
          voiceListening={voice.listening}
        />
      ) : null}
      {!heroHallOpen ? (
        <HelmetTypewriterIntel
          graphRoute={graphRoute}
          recommendedAgents={recommendedAgents}
          status={agentStatus}
          voiceAwake={voiceAwake}
        />
      ) : null}
      <WorkflowDock
        active={agentStatus === 'streaming' || workflowHighlight !== 'none'}
        agents={dockRecommendedAgents}
        highlight={workflowHighlight}
        onOpenHeroHall={() => setHeroHallOpen(true)}
        routeSegments={dockRouteSegments}
      />
      <AgentHeroHall
        agents={recommendedAgents}
        open={heroHallOpen}
        onClose={() => setHeroHallOpen(false)}
        onLineupsChange={setHeroHallLineupState}
      />

      {!heroHallOpen ? (
        <section className="dialogue-stage" aria-label="AI particle dialogue">
          {captionText ? (
            <div className="orb-caption" data-testid="conversation-state">
              <Sparkles size={16} />
              <span className="assistant-subtitle-wave" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>{captionText}</span>
            </div>
          ) : null}

          {readoutText ? (
            <div className="voice-readout" aria-live="polite">
              <span className="assistant-subtitle">
                <span className="assistant-subtitle-wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>{readoutText}</span>
              </span>
            </div>
          ) : null}
        </section>
      ) : null}

      <AgentConsole
        draft={draft}
        helmetVoice={!heroHallOpen}
        inputMode={inputMode}
        onDraftKeyDown={handleDraftKeyDown}
        onModeChange={switchInputMode}
        onSend={sendDraftMessage}
        onToggleVoice={toggleManualVoiceSession}
        setDraft={setDraft}
        speakingText={currentSpeechText}
        status={agentStatus}
        turns={agentTurns}
        voiceHeardText={lastHeard}
        voiceAwake={voiceAwake}
        voiceListening={voice.listening}
        voiceTranscript={voice.transcript}
        voiceSupported={voice.supported}
      />
    </main>
  );
}

function HelmetTypewriterIntel({
  graphRoute,
  recommendedAgents,
  status,
  voiceAwake,
}: {
  graphRoute: string[];
  recommendedAgents: RecommendedAgent[];
  status: AgentStatus;
  voiceAwake: boolean;
}) {
  const routeSignal = graphRoute.join('|');
  const agentSignal = recommendedAgents
    .map((agent) => `${agent.agent_index || agent.rank || ''}:${agent.agent_name || agent.name || agent.stage || ''}`)
    .join('|');
  const stateMachineKey = `${routeSignal}:${agentSignal}:${status}:${voiceAwake}`;
  const states = useMemo(
    () => buildHelmetIntelStates({ graphRoute, recommendedAgents, status, voiceAwake }),
    [agentSignal, routeSignal, status, voiceAwake],
  );
  const [stateIndex, setStateIndex] = useState(0);
  const currentState = states[stateIndex % states.length] || states[0];
  const [typedCopy, setTypedCopy] = useState(currentState.copy);

  useEffect(() => {
    setStateIndex(0);
  }, [stateMachineKey]);

  useEffect(() => {
    if (states.length <= 1) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setStateIndex((index) => (index + 1) % states.length);
    }, 5600);

    return () => window.clearInterval(interval);
  }, [stateMachineKey, states.length]);

  useEffect(() => {
    let index = 0;
    setTypedCopy('');

    const interval = window.setInterval(() => {
      index += 1;
      setTypedCopy(currentState.copy.slice(0, index));

      if (index >= currentState.copy.length) {
        window.clearInterval(interval);
      }
    }, 24);

    return () => window.clearInterval(interval);
  }, [currentState.copy]);

  return (
    <aside className="helmet-typewriter-intel" data-status={status} data-tone={currentState.tone} aria-live="polite">
      <div className="helmet-typewriter-kicker">
        <ScanLine size={13} />
        <span>{currentState.channel}</span>
        <i />
      </div>
      <p>
        <span>{typedCopy}</span>
        <b aria-hidden="true" />
      </p>
      <div className="helmet-typewriter-meta" aria-hidden="true">
        <span>{currentState.metaLeft}</span>
        <span>{currentState.metaRight}</span>
      </div>
    </aside>
  );
}

function JarvisHelmetHud({
  inputMode,
  status,
  voiceAwake,
  voiceListening,
}: {
  inputMode: InputMode;
  status: AgentStatus;
  voiceAwake: boolean;
  voiceListening: boolean;
}) {
  const linkState = status === 'streaming' ? 'AI STREAM' : voiceAwake ? 'VOICE LINK' : 'STANDBY';
  const neuralState = status === 'streaming' ? 'SYNCING' : voiceListening ? 'LISTENING' : 'ONLINE';

  return (
    <div className="jarvis-helmet-hud" data-awake={voiceAwake} data-status={status} aria-hidden="true">
      <div className="helmet-visor-shell helmet-visor-shell-left" />
      <div className="helmet-visor-shell helmet-visor-shell-right" />
      <div className="helmet-visor-shell helmet-visor-shell-top" />
      <div className="helmet-visor-shell helmet-visor-shell-bottom" />
      <div className="helmet-armor-corner helmet-armor-corner-tl" />
      <div className="helmet-armor-corner helmet-armor-corner-tr" />
      <div className="helmet-armor-corner helmet-armor-corner-bl" />
      <div className="helmet-armor-corner helmet-armor-corner-br" />

      <div className="helmet-hud-topline">
        <div className="helmet-hud-brand">
          <ShieldCheck size={16} />
          <span>JARVIS HELM</span>
        </div>
        <div className="helmet-hud-data">
          <span>{linkState}</span>
          <span>CORE 97%</span>
          <span>{inputMode.toUpperCase()}</span>
        </div>
      </div>

      <div className="helmet-hud-reticle">
        <span className="helmet-reticle-ring helmet-reticle-ring-outer" />
        <span className="helmet-reticle-ring helmet-reticle-ring-mid" />
        <span className="helmet-reticle-ring helmet-reticle-ring-inner" />
        <span className="helmet-reticle-cross helmet-reticle-cross-x" />
        <span className="helmet-reticle-cross helmet-reticle-cross-y" />
        <span className="helmet-reticle-scan" />
      </div>

      <div className="helmet-hud-stack helmet-hud-stack-left">
        <div>
          <Cpu size={14} />
          <span>{neuralState}</span>
        </div>
        <i />
        <i />
        <i />
      </div>

      <div className="helmet-hud-stack helmet-hud-stack-right">
        <div>
          <Radar size={14} />
          <span>TARGET LOCK</span>
        </div>
        <i />
        <i />
        <i />
      </div>

      <div className="helmet-hud-bottomline">
        <span>
          <Activity size={14} />
          REACTOR STABLE
        </span>
        <span>
          <ScanLine size={14} />
          VISOR ACTIVE
        </span>
      </div>
    </div>
  );
}

