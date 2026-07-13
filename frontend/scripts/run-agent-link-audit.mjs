import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const baseUrl = String(process.argv[2] || 'https://agent.xtznai.com').replace(/\/+$/, '');
const outputPath = process.env.AGENT_LINK_AUDIT_OUTPUT ? path.resolve(process.env.AGENT_LINK_AUDIT_OUTPUT) : '';
const response = await fetch(`${baseUrl}/api/agents`);
const payload = await response.json();
const agents = Array.isArray(payload?.agents) ? payload.agents : [];
const missing = agents
  .filter((agent) => !String(agent.launch_url || '').trim())
  .map((agent) => ({ id: agent.id, name: agent.name, type: agent.type }));
const groups = new Map();

for (const agent of agents) {
  const url = String(agent.launch_url || '').trim();
  if (!url) {
    continue;
  }
  groups.set(url, [...(groups.get(url) || []), { id: agent.id, name: agent.name, type: agent.type }]);
}

const duplicateGroups = [...groups.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([url, entries]) => ({ entries, url }));
const unexpectedMissing = missing.filter((agent) => String(agent.type || '').trim() !== '项目');
const unexpectedDuplicates = duplicateGroups.filter(
  ({ entries }) => !entries.some((agent) => String(agent.type || '').includes('别名')),
);

const urls = [...groups.keys()];
const results = [];

for (let index = 0; index < urls.length; index += 4) {
  const batch = urls.slice(index, index + 4);
  results.push(
    ...(await Promise.all(
      batch.map(async (url) => {
        const startedAt = performance.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        try {
          const headResponse = await fetch(url, {
            headers: { 'user-agent': 'Mozilla/5.0 AgentWorkshopProductionAudit/1.0' },
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
          });
          let linkResponse = headResponse;
          let fallbackMethod = '';

          if (!headResponse.ok) {
            linkResponse = await fetch(url, {
              headers: { 'user-agent': 'Mozilla/5.0 AgentWorkshopProductionAudit/1.0' },
              method: 'GET',
              redirect: 'follow',
              signal: controller.signal,
            });
            fallbackMethod = 'GET';
            await linkResponse.body?.cancel();
          }

          return {
            durationMs: Math.round(performance.now() - startedAt),
            fallbackMethod,
            finalUrl: linkResponse.url,
            headStatus: headResponse.status,
            names: groups.get(url),
            ok: linkResponse.ok,
            status: linkResponse.status,
            url,
          };
        } catch (error) {
          return {
            durationMs: Math.round(performance.now() - startedAt),
            error: error instanceof Error ? error.message : String(error),
            names: groups.get(url),
            ok: false,
            status: 0,
            url,
          };
        } finally {
          clearTimeout(timeout);
        }
      }),
    )),
  );
}

const report = {
  baseUrl,
  broken: results.filter((result) => !result.ok),
  duplicates: duplicateGroups,
  generatedAt: new Date().toISOString(),
  missing,
  results,
  summary: {
    agentCount: agents.length,
    brokenCount: results.filter((result) => !result.ok).length,
    duplicateUrlCount: [...groups.values()].filter((entries) => entries.length > 1).length,
    missingCount: missing.length,
    unexpectedDuplicateUrlCount: unexpectedDuplicates.length,
    unexpectedMissingCount: unexpectedMissing.length,
    uniqueUrlCount: urls.length,
  },
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}
process.stdout.write(output);
if (report.broken.length > 0 || unexpectedMissing.length > 0 || unexpectedDuplicates.length > 0) {
  process.exitCode = 1;
}
