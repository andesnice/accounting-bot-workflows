import fs from 'node:fs';
import crypto from 'node:crypto';

const settings = JSON.parse(fs.readFileSync('C:/Users/Nice/.claude/settings.local.json', 'utf8'));
const apiBase = settings?.env?.N8N_API_BASE?.replace(/\/$/, '');
const apiKey = settings?.env?.N8N_API_KEY;
if (!apiBase || !apiKey) throw new Error('找不到 n8n API 設定');

const source = JSON.parse(fs.readFileSync('LINE 一句話記帳 × Notion.json', 'utf8'));
const successNode = structuredClone(source.nodes.find((node) => node.name === '清除待確認並組成功訊息'));
if (!successNode) throw new Error('找不到成功回覆節點');

const suffix = crypto.randomBytes(5).toString('hex');
const webhookPath = `accounting-notion-link-smoke-${suffix}`;
const notionUrl = 'https://app.notion.com/p/smoke-test-page';
const webhook = {
  parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} },
  id: crypto.randomUUID(), name: '測試 Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
  position: [0, 0], webhookId: crypto.randomUUID(),
};
const original = {
  parameters: {
    jsCode: `return [{ json: { userId: 'smoke-notion-link', replyToken: 'smoke-reply', amount: 1350, category: '油錢', payment: '玉山刷卡', note: '中油加油', date: '2026-10-25', url: '${notionUrl}' } }];`,
  },
  id: crypto.randomUUID(), name: '解析一句話與狀態', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0],
};
successNode.id = crypto.randomUUID();
successNode.position = [480, 0];
const respond = {
  parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
  id: crypto.randomUUID(), name: '回傳測試結果', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4,
  position: [720, 0],
};
const nodes = [webhook, original, successNode, respond];
const connections = {
  '測試 Webhook': { main: [[{ node: '解析一句話與狀態', type: 'main', index: 0 }]] },
  '解析一句話與狀態': { main: [[{ node: '清除待確認並組成功訊息', type: 'main', index: 0 }]] },
  '清除待確認並組成功訊息': { main: [[{ node: '回傳測試結果', type: 'main', index: 0 }]] },
};

const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
const webhookBase = apiBase.replace(/\/api\/v1\/?$/, '');
let testId = '';
try {
  const create = await fetch(`${apiBase}/workflows`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: `TEMP 記帳成功Notion按鈕 ${suffix}`, nodes, connections, settings: { executionOrder: 'v1' } }),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`建立測試 workflow 失敗：${create.status} ${createText}`);
  testId = JSON.parse(createText).id;

  const activate = await fetch(`${apiBase}/workflows/${testId}/activate`, { method: 'POST', headers });
  if (!activate.ok) throw new Error(`啟用測試 workflow 失敗：${activate.status} ${await activate.text()}`);

  const call = await fetch(`${webhookBase}/webhook/${webhookPath}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000),
  });
  const callText = await call.text();
  if (!call.ok) throw new Error(`測試 webhook 失敗：${call.status} ${callText}`);
  const result = JSON.parse(callText);
  const buttons = result?.messages?.[0]?.contents?.footer?.contents || [];
  if (buttons[0]?.action?.type !== 'uri' || buttons[0]?.action?.uri !== notionUrl) {
    throw new Error(`Notion 按鈕不正確：${JSON.stringify(buttons)}`);
  }
  if (buttons[1]?.action?.type !== 'message' || buttons[1]?.action?.label !== '再記一筆') {
    throw new Error(`再記一筆按鈕不正確：${JSON.stringify(buttons)}`);
  }
  console.log(JSON.stringify({ ok: true, testId, webhookPath, notionUrl, buttonCount: buttons.length }, null, 2));
} finally {
  if (testId) {
    await fetch(`${apiBase}/workflows/${testId}/deactivate`, { method: 'POST', headers }).catch(() => {});
    const remove = await fetch(`${apiBase}/workflows/${testId}`, { method: 'DELETE', headers });
    if (!remove.ok && remove.status !== 404) throw new Error(`清理測試 workflow 失敗：${remove.status}`);
    const verifyRemoved = await fetch(`${apiBase}/workflows/${testId}`, { headers });
    if (verifyRemoved.status !== 404) throw new Error(`測試 workflow 未確實刪除：${verifyRemoved.status}`);
  }
}
