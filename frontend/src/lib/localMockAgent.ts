import type { AgentAction, Message, RecommendedAgent } from '../types';
import { detectConversationLanguage, isChineseLanguage } from './language';

type LocalAgentResponse = {
  actions: AgentAction[];
  recommendedAgents?: RecommendedAgent[];
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

const chineseIntentMatchers = [
  {
    labelEn: 'content generation',
    pattern: /\u6587\u6848|\u5185\u5bb9|\u6587\u7ae0|\u5c0f\u7ea2\u4e66|\u516c\u4f17\u53f7/,
  },
  {
    labelEn: 'growth and acquisition',
    pattern: /\u83b7\u5ba2|\u6d41\u91cf|\u589e\u957f|\u5f15\u6d41/,
  },
  {
    labelEn: 'sales follow-up',
    pattern: /\u5ba2\u6237|\u9500\u552e|\u8ddf\u8fdb|\u6210\u4ea4|crm/i,
  },
  {
    labelEn: 'knowledge graph navigation',
    pattern: /\u77e5\u8bc6\u56fe\u8c31|\u56fe\u8c31|\u8def\u5f84|\u8282\u70b9|\u5173\u7cfb/,
  },
  {
    labelEn: 'analysis and reporting',
    pattern: /\u5206\u6790|\u590d\u76d8|\u603b\u7ed3|\u5468\u62a5|\u62a5\u544a/,
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
  const chineseMatch = chineseIntentMatchers.find((intent) => intent.pattern.test(input));

  if (chineseMatch) {
    return routeIntents.find((intent) => intent.labelEn === chineseMatch.labelEn);
  }

  return routeIntents.find((intent) => intent.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())));
}

function pickStableReply(input: string) {
  const sum = Array.from(input).reduce((total, char) => total + char.charCodeAt(0), 0);
  return smallTalkReplies[sum % smallTalkReplies.length];
}

function wantsCapabilities(input: string) {
  const normalized = normalize(input);

  if (/\u4f60\u80fd|\u53ef\u4ee5|\u600e\u4e48|\u80fd\u804a|\u804a\u5929|\u5e2e\u6211|tts/i.test(input)) {
    return true;
  }

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

function wantsAgentRecommendation(input: string) {
  const normalized = normalize(input);

  if (/\u667a\u80fd\u4f53|\u63a8\u8350|\u7528\u54ea\u4e2a|\u8c03\u54ea\u4e2a|agent/i.test(input)) {
    return true;
  }

  return ['recommend agent', 'which agent', 'agent recommendation', 'agent'].some((keyword) =>
    normalized.includes(keyword),
  );
}

function wantsGreeting(input: string) {
  const normalized = normalize(input);

  if (/\u4f60\u597d|\u5728\u5417|\u55e8|\u54c8\u55bd/.test(input)) {
    return true;
  }

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
      recommendedAgents: wantsAgentRecommendation(input) ? buildLocalRecommendedAgents(label, useChinese) : undefined,
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

  if (wantsAgentRecommendation(input)) {
    const label = useChinese ? '智能体推荐' : 'agent recommendation';

    return {
      actions: [{ type: 'chat' }],
      recommendedAgents: buildLocalRecommendedAgents(label, useChinese),
      text: useChinese
        ? '已为你筛出一组可接入当前工作流的智能体。真实 Agent 服务接上后，这里会展示实时推荐结果。'
        : 'I have selected a compact agent set for this workflow. Once the real agent service is connected, this card draw will use live recommendations.',
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

function buildLocalRecommendedAgents(label: string, useChinese: boolean): RecommendedAgent[] {
  const stagePrefix = useChinese ? '本地预演' : 'local preview';

  return [
    {
      agent_index: 0,
      agent_name: useChinese ? '路径规划智能体' : 'Path Planning Agent',
      rank: 1,
      reason: useChinese
        ? `适合先把“${label}”拆成可执行路线，并输出图谱控制事件。`
        : `Best for turning "${label}" into an executable route and graph-control event.`,
      score: 96,
      stage: stagePrefix,
      streamStatus: 'completed',
    },
    {
      agent_index: 1,
      agent_name: useChinese ? '知识图谱导航员' : 'Knowledge Graph Navigator',
      rank: 2,
      reason: useChinese ? '负责把路径落到节点、边和局部放大视角。' : 'Maps intent into nodes, edges, and local zoom focus.',
      score: 92,
      stage: stagePrefix,
      streamStatus: 'completed',
    },
    {
      agent_index: 2,
      agent_name: useChinese ? '业务标签分析师' : 'Business Tag Analyst',
      rank: 3,
      reason: useChinese ? '补全标签、语义归类和后续动作建议。' : 'Completes tags, semantic grouping, and suggested next actions.',
      score: 88,
      stage: stagePrefix,
      streamStatus: 'completed',
    },
  ];
}
