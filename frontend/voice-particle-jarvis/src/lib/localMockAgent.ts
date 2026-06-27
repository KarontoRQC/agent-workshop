import type { AgentAction, Message } from '../types';
import { detectConversationLanguage, isChineseLanguage } from './language';

type LocalAgentResponse = {
  actions: AgentAction[];
  text: string;
};

type RouteIntent = {
  keywords: string[];
  labelEn: string;
  labelZh: string;
  routeEn: string[];
  routeZh: string[];
};

const routeIntents: RouteIntent[] = [
  {
    keywords: ['copy', 'content', 'article', 'post', 'xiaohongshu', 'wechat', '文案', '内容', '文章', '小红书', '公众号'],
    labelEn: 'content generation',
    labelZh: '内容生成',
    routeEn: ['Agent Workshop', 'Marketing', 'Copywriting', 'Content agents'],
    routeZh: ['智能体工作坊', '营销', '文案', '内容智能体'],
  },
  {
    keywords: ['lead', 'traffic', 'acquisition', 'growth', '获客', '流量', '增长', '引流'],
    labelEn: 'growth and acquisition',
    labelZh: '增长获客',
    routeEn: ['Agent Workshop', 'Marketing', 'Growth', 'Acquisition agents'],
    routeZh: ['智能体工作坊', '营销', '增长', '获客智能体'],
  },
  {
    keywords: ['sales', 'crm', 'follow', 'customer', '客户', '销售', '跟进', '成交'],
    labelEn: 'sales follow-up',
    labelZh: '销售跟进',
    routeEn: ['Agent Workshop', 'Operations', 'CRM', 'Sales agents'],
    routeZh: ['智能体工作坊', '运营', 'CRM', '销售智能体'],
  },
  {
    keywords: ['knowledge', 'graph', 'path', 'node', 'map', '知识图谱', '图谱', '路径', '节点'],
    labelEn: 'knowledge graph navigation',
    labelZh: '知识图谱导航',
    routeEn: ['Agent Workshop', 'Knowledge Graph', 'Path selection', 'Graph controller'],
    routeZh: ['智能体工作坊', '知识图谱', '路径选择', '图谱控制器'],
  },
  {
    keywords: ['review', 'summary', 'report', '复盘', '总结', '周报', '报告'],
    labelEn: 'analysis and reporting',
    labelZh: '分析报告',
    routeEn: ['Agent Workshop', 'Analysis', 'Review', 'Reporting agents'],
    routeZh: ['智能体工作坊', '分析', '复盘', '报告智能体'],
  },
];

const smallTalkReplies = [
  'I am online, sir. Voice, particles, and local reasoning are all standing by.',
  'Local mode is active. I can hold a basic conversation, classify your intent, and prepare graph-control events.',
  'Understood. I will keep the interface responsive while the real reasoning layer remains detachable.',
  'Certainly, sir. Give me a task, a business problem, or a graph direction, and I will prepare the local route.',
];

const smallTalkRepliesZh = [
  '我在线，先生。语音、粒子和本地推理都已待命。',
  '本地模式已启动。我可以做基础对话、识别意图，并准备图谱控制事件。',
  '收到。我会保持界面响应，真实推理层后续可以无缝接入。',
  '当然。你可以直接说任务、业务问题，或者图谱方向，我会先准备本地路径。',
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalize(input: string) {
  return input.trim().toLowerCase();
}

function findRouteIntent(input: string) {
  const normalized = normalize(input);

  return routeIntents.find((intent) => intent.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())));
}

function pickStableReply(input: string) {
  const sum = Array.from(input).reduce((total, char) => total + char.charCodeAt(0), 0);
  return smallTalkReplies[sum % smallTalkReplies.length];
}

function wantsCapabilities(input: string) {
  const normalized = normalize(input);

  return [
    'what can you do',
    'help',
    'capability',
    'can you',
    '你能',
    '可以做',
    '怎么搞',
    '能聊天',
    'tts',
  ].some((keyword) => normalized.includes(keyword));
}

function wantsGreeting(input: string) {
  const normalized = normalize(input);

  return ['hello', 'hi', 'hey', 'jarvis', '你好', '在吗'].some((keyword) => normalized.includes(keyword));
}

function lastUserTopic(history: Message[]) {
  const lastUserMessage = [...history].reverse().find((message) => message.speaker === 'you');
  return lastUserMessage?.text.trim();
}

export async function requestLocalMockAgentReply(input: string, history: Message[] = []): Promise<LocalAgentResponse> {
  await wait(360);

  const language = detectConversationLanguage(input);
  const useChinese = isChineseLanguage(language);
  const routeIntent = findRouteIntent(input);

  if (routeIntent) {
    const label = useChinese ? routeIntent.labelZh : routeIntent.labelEn;
    const route = useChinese ? routeIntent.routeZh : routeIntent.routeEn;

    return {
      actions: [
        {
          confidence: 0.82,
          label,
          route,
          type: 'focus_graph_path',
        },
      ],
      text: useChinese
        ? [`已选择路径：${label}。`, `我会把图谱聚焦到 ${route.join(' 到 ')}。`, '等真实图谱接入后，这个动作会驱动节点高亮和路径动画。'].join(
            '',
          )
        : [
            `Route selected: ${label}.`,
            `I would focus the graph through ${route.join(' to ')}.`,
            'Once the graph surface is attached, this local action can drive the same highlight and path animation as the Coze workflow.',
          ].join(' '),
    };
  }

  if (wantsCapabilities(input)) {
    return {
      actions: [{ type: 'chat' }],
      text: useChinese
        ? [
            '可以，先生。当前本地模式可以免费跑通语音识别、mock 推理、TTS 回复和粒子反馈。',
            '现在的聊天还是规则型，但动作协议是真实的，后面可以换成本地模型、Coze 或其他 Agent，而不用重做界面。',
          ].join('')
        : [
            'Yes, sir. In local mode I can run the voice loop for free: speech recognition, a mock reasoning layer, spoken replies, and particle response.',
            'The chat is rule-based for now, but the action protocol is real, so a local model or Coze can replace me later without redesigning the interface.',
          ].join(' '),
    };
  }

  if (wantsGreeting(input)) {
    return {
      actions: [{ type: 'chat' }],
      text: useChinese ? '我在，先生。本地 JARVIS 界面已上线。你想让我检查或控制什么？' : 'Good evening, sir. Local JARVIS interface is online. What would you like me to inspect or control?',
    };
  }

  const topic = lastUserTopic(history);

  return {
    actions: [{ type: 'chat' }],
    text: useChinese
      ? topic
        ? `${smallTalkRepliesZh[Array.from(input).reduce((total, char) => total + char.charCodeAt(0), 0) % smallTalkRepliesZh.length]}我还记得上一轮主题：“${topic}”。`
        : smallTalkRepliesZh[Array.from(input).reduce((total, char) => total + char.charCodeAt(0), 0) % smallTalkRepliesZh.length]
      : topic
        ? `${pickStableReply(input)} I still have the last topic in context: "${topic}".`
        : pickStableReply(input),
  };
}
