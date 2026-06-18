import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("data/source_agents_full.json");
const outputPath = path.resolve("data/agent_graph_pack.json");

const rawRows = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const [nameKey, functionKey, typeKey, linkKey, knowledgeKey, introKey] = Object.keys(rawRows[0]);

const ROOT_ID = "root-brief";

function compactText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
}

function shorten(text, max = 96) {
  const chars = [...compactText(text)];
  return chars.length > max ? `${chars.slice(0, max).join("")}...` : chars.join("");
}

function splitKnowledge(value) {
  return String(value || "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function agentScore(row) {
  let score = 80;
  if (row[linkKey]) score += 6;
  if (row[knowledgeKey]) score += 4;
  if (row[introKey]) score += 5;
  return Math.min(96, score);
}

const rows = rawRows.map((row, index) => {
  const id = `agent-${String(index + 1).padStart(3, "0")}`;
  const name = compactText(row[nameKey]) || id;
  const intro = compactText(row[introKey]);
  return {
    id,
    name,
    functionLabel: compactText(row[functionKey]) || "未标注",
    typeLabel: compactText(row[typeKey]) || "未标注",
    link: compactText(row[linkKey]) || null,
    knowledge: splitKnowledge(row[knowledgeKey]),
    intro,
    summary: intro ? shorten(intro, 92) : `${name} 是当前智能体库中的可调用能力。`,
    score: agentScore(row),
  };
});

function includesAny(text, keywords = []) {
  return keywords.some((keyword) => keyword && text.includes(String(keyword).toLowerCase()));
}

function pickAgents(query = {}, cap = 7) {
  const functionSet = new Set(query.functions || []);
  const typeSet = new Set(query.types || []);
  const keywords = query.keywords || [];

  const scored = rows.map((row) => {
    const haystack = [
      row.name,
      row.functionLabel,
      row.typeLabel,
      row.summary,
      row.knowledge.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    let score = row.score;
    if (functionSet.has(row.functionLabel)) score += 14;
    if (typeSet.has(row.typeLabel)) score += 8;
    if (includesAny(haystack, keywords)) score += 16;
    return { row, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id))
    .slice(0, cap)
    .map(({ row }) => row.id);
}

function q(functions = [], keywords = [], types = []) {
  return { functions, keywords, types };
}

function leaf(id, label, nodeType, summary, query) {
  return { id, label, type: nodeType, summary, query, children: [] };
}

function branch(id, label, nodeType, summary, query, children = []) {
  return { id, label, type: nodeType, summary, query, children };
}

const industrySpecs = [
  branch(
    "industry-baijiu",
    "白酒行业招商获客",
    "industry",
    "围绕招商获客、渠道承接、内容触达、销售跟进和数据复盘建立业务关系路径。",
    q(["管理", "专家", "销售"], ["招商", "白酒", "渠道", "获客"]),
    [
      branch("baijiu-target", "目标洞察", "problem", "先识别招商对象、代理画像、市场机会和决策理由。", q(["管理", "专家", "销售"], ["画像", "定位", "决策"]), [
        leaf("baijiu-market", "市场分析", "variable", "判断区域市场容量、竞品和进入切口。", q(["管理", "专家"], ["市场", "分析"])),
        leaf("baijiu-avatar", "客户画像", "variable", "拆出代理商画像、动机和顾虑。", q(["销售", "专家"], ["画像", "客户"])),
        leaf("baijiu-demand", "需求挖掘", "action", "把模糊咨询转成可跟进的真实需求。", q(["销售"], ["需求", "挖掘"])),
        leaf("baijiu-decision", "决策分析", "variable", "识别谁拍板、谁影响、谁反对。", q(["管理", "销售"], ["决策"])),
      ]),
      branch("baijiu-leads", "线索获取", "problem", "处理线索来源、渠道评估、客户优先级和线索质量。", q(["销售", "管理"], ["线索", "渠道", "获客"]), [
        leaf("lead-source", "线索来源识别", "variable", "判断线索来自公域、私域、转介绍还是活动。", q(["销售"], ["线索来源"])),
        leaf("lead-channel", "渠道评估", "variable", "比较渠道质量、成本和转化潜力。", q(["管理", "销售"], ["渠道评估"])),
        leaf("lead-clean", "线索清洗", "action", "去掉低质、重复和无效线索。", q(["功能类", "销售"], ["线索清洗"])),
        leaf("lead-score", "线索评分", "variable", "按意向、预算、区域、资源给线索分层。", q(["销售", "管理"], ["评分"])),
      ]),
      branch("baijiu-content", "内容触达", "capability", "用朋友圈、小红书、公众号和短视频承接陌生信任。", q(["文案", "IP", "私域"], ["内容", "朋友圈", "小红书"]), [
        leaf("content-moments", "朋友圈内容", "asset", "生成能维持人设和成交线索的朋友圈。", q(["文案", "私域"], ["朋友圈"])),
        leaf("content-xhs", "小红书种草", "asset", "把行业场景转成小红书种草内容。", q(["文案", "IP"], ["小红书", "种草"])),
        leaf("content-article", "公众号图文", "asset", "生成招商说明、案例和长图文。", q(["文案"], ["公众号", "图文"])),
        leaf("content-video", "短视频口播", "asset", "把卖点变成短视频口播脚本。", q(["文案", "直播"], ["短视频", "口播"])),
      ]),
      branch("baijiu-follow", "销售跟进", "capability", "围绕客户阶段生成话术、节奏、异议处理和下一步动作。", q(["销售", "私域"], ["跟进", "话术", "异议"]), [
        leaf("follow-script", "邀约话术", "action", "生成破冰、邀约和二次触达话术。", q(["销售", "文案"], ["话术", "邀约"])),
        leaf("follow-strategy", "跟进策略", "action", "给不同意向客户安排跟进节奏。", q(["销售", "管理"], ["跟进策略"])),
        leaf("follow-objection", "异议处理", "action", "把拒绝点翻译成下一步回应。", q(["销售"], ["异议"])),
        leaf("follow-deal", "成交促单", "action", "生成临门一脚的促单理由和动作。", q(["销售"], ["成交", "促单"])),
      ]),
      branch("baijiu-private", "私域沉淀", "capability", "把线索沉淀成可复访、可养熟、可转化的关系资产。", q(["私域", "销售"], ["私域", "社群", "复购"]), [
        leaf("private-tag", "客户标签", "variable", "记录客户阶段、兴趣点和资源能力。", q(["私域", "管理"], ["标签"])),
        leaf("private-nurture", "养熟内容", "asset", "按客户状态推送不同内容。", q(["私域", "文案"], ["养熟"])),
        leaf("private-community", "社群承接", "action", "设计入群、激活和成交承接动作。", q(["私域"], ["社群"])),
        leaf("private-rebuy", "复购提醒", "action", "把一次成交变成长期关系。", q(["私域", "销售"], ["复购"])),
      ]),
      branch("baijiu-review", "数据复盘", "capability", "把触达、线索、内容和成交过程转成可复盘指标。", q(["管理", "功能类"], ["数据", "复盘", "指标"]), [
        leaf("review-metrics", "指标看板", "variable", "看线索量、有效率、转化率和成交周期。", q(["管理", "功能类"], ["指标"])),
        leaf("review-source", "来源归因", "variable", "判断哪类渠道和内容最值得继续投。", q(["管理"], ["归因"])),
        leaf("review-dropoff", "转化漏斗", "variable", "识别客户在哪一步流失。", q(["管理", "销售"], ["漏斗"])),
        leaf("review-next", "下一步动作", "action", "把复盘结果变成下一轮行动。", q(["管理", "销售"], ["下一步"])),
      ]),
    ],
  ),
  branch("industry-catering", "餐饮连锁", "industry", "围绕门店选址、加盟转化、外卖增长和复购运营展开。", q(["管理", "文案"], ["餐饮", "加盟"]), [
    leaf("catering-location", "选址判断", "problem", "判断商圈、客流和门店模型是否匹配。", q(["管理", "专家"], ["选址"])),
    leaf("catering-franchise", "加盟转化", "problem", "把品牌模型、投入回报和案例证据说清楚。", q(["销售", "文案"], ["加盟"])),
    leaf("catering-takeaway", "外卖增长", "capability", "拆解平台流量、套餐设计和复购提醒。", q(["文案", "管理"], ["外卖"])),
    leaf("catering-repeat", "会员复购", "capability", "把一次到店变成可持续触达的人群。", q(["私域"], ["复购", "会员"])),
  ]),
  branch("industry-beauty", "美业门店", "industry", "拆解到店转化、项目包装、顾问话术、会员复购和私域养熟。", q(["私域", "文案"], ["美业", "门店"]), [
    leaf("beauty-trust", "信任建立", "problem", "用案例、顾问表达和客户证据降低陌生感。", q(["文案", "IP"], ["信任"])),
    leaf("beauty-package", "项目包装", "capability", "把项目价值、适用人群和效果边界讲清楚。", q(["文案"], ["项目包装"])),
    leaf("beauty-consultant", "顾问话术", "action", "把咨询过程拆成可执行话术。", q(["销售"], ["顾问", "话术"])),
    leaf("beauty-private", "私域养熟", "capability", "按客户状态安排内容和跟进。", q(["私域"], ["私域"])),
  ]),
  branch("industry-education", "教育培训", "industry", "围绕试听课、家长沟通、转介绍、续费和课程价值证明展开。", q(["文案", "销售"], ["教育", "培训"]), [
    leaf("edu-trial", "试听转化", "problem", "把试听体验转成报名理由。", q(["销售", "文案"], ["试听"])),
    leaf("edu-parent", "家长沟通", "action", "回应家长期待、焦虑和价格顾虑。", q(["销售"], ["家长"])),
    leaf("edu-renewal", "续费提醒", "action", "根据学习进展生成续费沟通。", q(["私域", "销售"], ["续费"])),
    leaf("edu-proof", "结果证明", "asset", "沉淀案例、反馈和成果展示。", q(["文案"], ["案例", "成果"])),
  ]),
  branch("industry-local-life", "本地生活", "industry", "处理团购转化、到店核销、评价沉淀、商圈竞争和复购提醒。", q(["私域", "文案"], ["本地生活", "团购"]), [
    leaf("local-groupbuy", "团购转化", "problem", "把低价流量转成到店和复购。", q(["文案", "销售"], ["团购"])),
    leaf("local-review", "评价沉淀", "asset", "把真实评价变成信任素材。", q(["文案"], ["评价"])),
    leaf("local-repeat", "复购提醒", "action", "在合适时间提醒二次消费。", q(["私域"], ["复购"])),
    leaf("local-competition", "商圈竞争", "variable", "识别周边竞品和差异化切口。", q(["管理", "专家"], ["竞争"])),
  ]),
  branch("industry-enterprise", "企服获客", "industry", "从线索评分、顾问式销售、方案生成、决策链和交付证明展开。", q(["销售", "管理"], ["企服", "获客"]), [
    leaf("b2b-score", "线索评分", "problem", "识别客户预算、场景和优先级。", q(["销售", "管理"], ["线索评分"])),
    leaf("b2b-solution", "方案生成", "asset", "把需求转成客户能看懂的方案。", q(["专家", "文案"], ["方案"])),
    leaf("b2b-decision", "决策链识别", "variable", "识别使用者、影响者和拍板者。", q(["销售", "管理"], ["决策链"])),
    leaf("b2b-delivery", "交付证明", "asset", "用案例和数据证明可交付。", q(["文案", "管理"], ["交付", "案例"])),
  ]),
  branch("industry-tourism", "文旅招商", "industry", "把目的地内容、渠道合作、活动招商和游客转化串成路径。", q(["文案", "IP"], ["文旅", "招商"]), [
    leaf("tour-content", "目的地内容", "asset", "把资源、故事和体验转成内容资产。", q(["文案", "IP"], ["内容"])),
    leaf("tour-channel", "渠道合作", "action", "匹配旅行社、达人和异业渠道。", q(["销售", "管理"], ["渠道"])),
    leaf("tour-event", "活动招商", "action", "围绕活动设计招商话术和权益。", q(["文案", "销售"], ["活动招商"])),
    leaf("tour-conversion", "游客转化", "problem", "把流量转成咨询、到访和复购。", q(["私域", "销售"], ["转化"])),
  ]),
  branch("industry-medical-beauty", "医美私域", "industry", "围绕项目认知、咨询转化、案例证明、复诊提醒和合规边界展开。", q(["私域", "文案"], ["医美"]), [
    leaf("med-project", "项目认知", "asset", "把复杂项目讲得清楚、克制、合规。", q(["文案", "专家"], ["项目"])),
    leaf("med-consult", "咨询转化", "action", "从咨询问题进入顾虑处理。", q(["销售"], ["咨询"])),
    leaf("med-case", "案例证明", "asset", "用案例降低决策风险。", q(["文案"], ["案例"])),
    leaf("med-compliance", "合规边界", "variable", "避免夸大承诺和不合规表达。", q(["专家", "管理"], ["合规"])),
  ]),
  branch("industry-realestate", "房产渠道", "industry", "拆解渠道经纪、客户画像、案场邀约、异议处理和成交复盘。", q(["销售", "管理"], ["房产", "渠道"]), [
    leaf("real-agent", "渠道经纪", "variable", "判断经纪人资源和合作价值。", q(["销售"], ["渠道"])),
    leaf("real-invite", "案场邀约", "action", "生成邀约理由和到访动作。", q(["销售", "文案"], ["邀约"])),
    leaf("real-objection", "异议处理", "action", "处理预算、位置、时机和信任问题。", q(["销售"], ["异议"])),
    leaf("real-review", "成交复盘", "capability", "复盘客户阶段和下一步跟进。", q(["管理", "销售"], ["复盘"])),
  ]),
  branch("industry-agriculture", "农特产招商", "industry", "围绕产地故事、渠道分销、品鉴转化、达人内容和复购展开。", q(["文案", "销售"], ["农特产", "产地"]), [
    leaf("agri-origin", "产地故事", "asset", "把产地、品控和信任来源讲清楚。", q(["文案", "IP"], ["产地"])),
    leaf("agri-channel", "分销渠道", "action", "匹配渠道和分销话术。", q(["销售"], ["分销"])),
    leaf("agri-sample", "品鉴转化", "action", "把试吃试饮转成购买理由。", q(["销售", "文案"], ["品鉴"])),
    leaf("agri-repeat", "复购提醒", "action", "设计复购节奏和提醒内容。", q(["私域"], ["复购"])),
  ]),
  branch("industry-franchise", "品牌加盟", "industry", "围绕招商页、咨询承接、加盟证据、门店模型和跟进节奏展开。", q(["销售", "文案"], ["加盟", "品牌"]), [
    leaf("franchise-page", "招商页面", "asset", "把加盟优势、投入模型和案例呈现出来。", q(["文案"], ["招商页"])),
    leaf("franchise-proof", "加盟证据", "asset", "沉淀门店案例和收益证据。", q(["文案", "管理"], ["证据"])),
    leaf("franchise-model", "门店模型", "variable", "解释面积、人员、成本和回本逻辑。", q(["管理", "专家"], ["模型"])),
    leaf("franchise-follow", "跟进节奏", "action", "安排从咨询到签约的触达节奏。", q(["销售"], ["跟进"])),
  ]),
  branch("industry-highend-service", "高端服务", "industry", "处理客资筛选、私密沟通、顾问信任、服务证明和长期关系。", q(["私域", "专家"], ["高端", "服务"]), [
    leaf("high-filter", "客资筛选", "variable", "判断客户真实需求和匹配度。", q(["销售", "专家"], ["筛选"])),
    leaf("high-private", "私密沟通", "action", "设计克制、高质量的私密沟通。", q(["私域", "销售"], ["沟通"])),
    leaf("high-trust", "顾问信任", "problem", "建立专业感和长期信任。", q(["专家", "IP"], ["信任"])),
    leaf("high-relation", "长期关系", "capability", "把服务过程沉淀成持续关系。", q(["私域"], ["长期关系"])),
  ]),
];

const nodes = [];
const edges = [];

function addNode(node) {
  nodes.push(node);
}

function addEdge(source, target, relationType, relationLabel, sortOrder = 0) {
  edges.push({
    id: `${source}->${target}`,
    source,
    target,
    relationType,
    relationLabel,
    sortOrder,
  });
}

function getAddedNode(id) {
  return nodes.find((node) => node.id === id);
}

function makeRelationTitle(parentId, label) {
  const parent = getAddedNode(parentId);
  if (!parent || parentId === ROOT_ID) return label;
  return `${parent.label}-${label}`;
}

function addSemanticNode(spec, parentId, sortOrder = 0) {
  const children = spec.children || [];
  const displayLabel = makeRelationTitle(parentId, spec.label);
  addNode({
    id: spec.id,
    label: spec.label,
    displayLabel,
    type: spec.type,
    summary: spec.summary,
    insight: spec.insight || `${displayLabel} 是当前业务图谱中的语义节点，用于承接下一层拆解和智能体推荐。`,
    parent: parentId,
    children: children.map((child) => child.id),
    agents: pickAgents(spec.query, spec.agentCap || 7),
    count: children.length,
  });

  if (parentId) {
    addEdge(parentId, spec.id, relationFor(spec.type), displayLabel, sortOrder);
  }

  children.forEach((child, index) => addSemanticNode(child, spec.id, index + 1));
}

function relationFor(type) {
  if (type === "industry") return "starts_from_industry";
  if (type === "problem") return "decomposes_to_problem";
  if (type === "capability") return "maps_to_capability";
  if (type === "action") return "decomposes_to_action";
  if (type === "asset") return "decomposes_to_asset";
  return "decomposes_to_variable";
}

function relationLabelFor(type) {
  if (type === "industry") return "行业场景";
  if (type === "problem") return "痛点拆解";
  if (type === "capability") return "能力映射";
  if (type === "action") return "动作拆解";
  if (type === "asset") return "素材资产";
  return "变量拆解";
}

addNode({
  id: ROOT_ID,
  label: "业务关系索引",
  displayLabel: "业务关系索引",
  type: "brief",
  summary: `直接从具体业务关系进入，例如“本地生活-团购转化”；${rows.length} 个智能体会根据当前关系节点推荐可调用能力。`,
  insight: "这个索引用于组织数据，不作为前端画布中的总节点展示。",
  parent: null,
  children: industrySpecs.map((item) => item.id),
  agents: pickAgents(q(["管理", "专家", "销售"], ["策略", "诊断", "行业", "获客"]), 7),
  count: industrySpecs.length,
});

industrySpecs.forEach((spec, index) => addSemanticNode(spec, ROOT_ID, index + 1));

const agents = rows.map((agent) => ({
  id: agent.id,
  agentKey: agent.id,
  name: agent.name,
  role: agent.summary,
  provider: agent.link ? "chatgpt-gpt" : "local",
  endpoint: agent.link || "/api/agent-gateway/chat",
  score: agent.score,
  functionLabel: agent.functionLabel,
  typeLabel: agent.typeLabel,
  knowledge: agent.knowledge,
  status: agent.link ? "linked" : "draft",
}));

const pack = {
  version: "2026-06-18-agent-library-semantic-v2",
  rootId: ROOT_ID,
  stats: {
    agentCount: rows.length,
    industryCount: industrySpecs.length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  },
  nodes,
  edges,
  agents,
};

fs.writeFileSync(outputPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
console.log(`Built ${pack.stats.nodeCount} semantic nodes, ${pack.stats.edgeCount} edges, ${pack.stats.agentCount} agents.`);
