import fs from 'node:fs';
import crypto from 'node:crypto';

const settings = JSON.parse(fs.readFileSync('C:/Users/Nice/.claude/settings.local.json', 'utf8'));
const apiBase = settings?.env?.N8N_API_BASE;
const apiKey = settings?.env?.N8N_API_KEY;
if (!apiBase || !apiKey) throw new Error('找不到 n8n API 設定');

const source = JSON.parse(fs.readFileSync('LINE 一句話記帳 × Notion.json', 'utf8'));
const get = (name) => {
  const node = source.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`找不到節點：${name}`);
  return structuredClone(node);
};

const suffix = crypto.randomBytes(5).toString('hex');
const webhookPath = `accounting-ai-smoke-${suffix}`;
const webhook = {
  parameters: { httpMethod: 'POST', path: webhookPath, responseMode: 'responseNode', options: {} },
  id: crypto.randomUUID(), name: '測試 Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2,
  position: [0, 0], webhookId: crypto.randomUUID(),
};
const input = {
  parameters: {
    jsCode: "const body = $json.body || {}; return [{ json: { userId: String(body.userId || 'smoke-test'), replyToken: 'smoke-test', message: String(body.message || ''), webhookEventId: String(body.eventId || Date.now()) } }];",
  },
  id: crypto.randomUUID(), name: '測試輸入', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0],
};
const respond = {
  parameters: { respondWith: 'json', responseBody: '={{ $json }}', options: {} },
  id: crypto.randomUUID(), name: '回傳測試結果', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.4, position: [1920, 0],
};

const selectedNames = [
  '解析一句話與狀態', '分流記帳動作',
  '讀取 Notion 分類設定', '準備 AI 分析資料',
  'AI 分析口語記帳', 'Gemini 記帳模型', 'AI 記帳輸出格式', '驗證 AI 結果並組卡片',
];
const selected = selectedNames.map(get);
const nodes = [webhook, input, ...selected, respond];
const positions = new Map([
  ['解析一句話與狀態', [480, 0]], ['分流記帳動作', [720, 0]],
  ['讀取 Notion 分類設定', [960, 0]], ['準備 AI 分析資料', [1200, 0]],
  ['AI 分析口語記帳', [1440, 0]],
  ['Gemini 記帳模型', [1400, 240]], ['AI 記帳輸出格式', [1600, 240]],
  ['驗證 AI 結果並組卡片', [1760, 0]],
]);
for (const node of selected) node.position = positions.get(node.name) || node.position;

const connections = {
  '測試 Webhook': { main: [[{ node: '測試輸入', type: 'main', index: 0 }]] },
  '測試輸入': { main: [[{ node: '解析一句話與狀態', type: 'main', index: 0 }]] },
  '解析一句話與狀態': { main: [[{ node: '分流記帳動作', type: 'main', index: 0 }]] },
  '分流記帳動作': { main: [
    [{ node: '回傳測試結果', type: 'main', index: 0 }],
    [{ node: '讀取 Notion 分類設定', type: 'main', index: 0 }],
    [{ node: '回傳測試結果', type: 'main', index: 0 }],
    [{ node: '回傳測試結果', type: 'main', index: 0 }],
  ] },
  '讀取 Notion 分類設定': { main: [[{ node: '準備 AI 分析資料', type: 'main', index: 0 }]] },
  '準備 AI 分析資料': { main: [[{ node: 'AI 分析口語記帳', type: 'main', index: 0 }]] },
  'Gemini 記帳模型': { ai_languageModel: [[{ node: 'AI 分析口語記帳', type: 'ai_languageModel', index: 0 }]] },
  'AI 記帳輸出格式': { ai_outputParser: [[{ node: 'AI 分析口語記帳', type: 'ai_outputParser', index: 0 }]] },
  'AI 分析口語記帳': { main: [[{ node: '驗證 AI 結果並組卡片', type: 'main', index: 0 }]] },
  '驗證 AI 結果並組卡片': { main: [[{ node: '回傳測試結果', type: 'main', index: 0 }]] },
};

const apiHeaders = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
let testId = '';
try {
  const create = await fetch(`${apiBase}/workflows`, {
    method: 'POST', headers: apiHeaders,
    body: JSON.stringify({ name: `TEMP AI記帳解析測試 ${suffix}`, nodes, connections, settings: { executionOrder: 'v1' } }),
  });
  const createText = await create.text();
  if (!create.ok) throw new Error(`建立測試 workflow 失敗：${create.status} ${createText}`);
  const created = JSON.parse(createText);
  testId = created.id;

  const activate = await fetch(`${apiBase}/workflows/${testId}/activate`, { method: 'POST', headers: apiHeaders });
  if (!activate.ok) throw new Error(`啟用測試 workflow 失敗：${activate.status} ${await activate.text()}`);

  const webhookBase = apiBase.replace(/\/api\/v1\/?$/, '');
  const call = async (userId, message, eventId) => {
    const response = await fetch(`${webhookBase}/webhook/${webhookPath}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ userId, message, eventId }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`測試 webhook 失敗：${response.status} ${text}`);
    return JSON.parse(text);
  };

  const first = await call('smoke-merge', '昨天花了 1500 元，用玉山卡，但忘了說買什麼。', 'merge-1');
  if (first?.messages?.[0]?.altText !== '需要補充記帳資訊') throw new Error(`第一輪未追問：${JSON.stringify(first)}`);
  if (!JSON.stringify(first).includes('重新一筆')) throw new Error(`追問卡缺少重新一筆：${JSON.stringify(first)}`);

  const merged = await call('smoke-merge', '加油', 'merge-2');
  if (merged?.messages?.[0]?.type !== 'flex') throw new Error(`補充後未回傳 Flex：${JSON.stringify(merged)}`);
  if (!String(merged.messages[0].altText).includes('1,500')) throw new Error(`補充後金額遺失：${JSON.stringify(merged)}`);
  const serialized = JSON.stringify(merged.messages[0]);
  if (!serialized.includes('油錢') || !serialized.includes('玉山刷卡')) throw new Error(`補充後分類或付款遺失：${serialized}`);

  await call('smoke-restart', '昨天花了 1500 元，用玉山卡，但忘了說買什麼。', 'restart-1');
  const restart = await call('smoke-restart', '重新一筆', 'restart-2');
  if (!JSON.stringify(restart).includes('確認重新一筆')) throw new Error(`重新一筆缺少二次確認：${JSON.stringify(restart)}`);
  const cleared = await call('smoke-restart', '確認重新一筆', 'restart-3');
  if (!JSON.stringify(cleared).includes('已清除目前資料')) throw new Error(`確認後未清除：${JSON.stringify(cleared)}`);

  const deactivateForErrorTest = await fetch(`${apiBase}/workflows/${testId}/deactivate`, { method: 'POST', headers: apiHeaders });
  if (!deactivateForErrorTest.ok) throw new Error(`錯誤分支測試前停用失敗：${deactivateForErrorTest.status}`);
  const modelNode = nodes.find((item) => item.name === 'Gemini 記帳模型');
  modelNode.credentials = { googlePalmApi: { id: '__missing_ai_credential_for_smoke_test__', name: '故意不存在的測試憑證' } };
  const updateForErrorTest = await fetch(`${apiBase}/workflows/${testId}`, {
    method: 'PUT', headers: apiHeaders,
    body: JSON.stringify({ name: created.name, nodes, connections, settings: { executionOrder: 'v1' } }),
  });
  if (!updateForErrorTest.ok) throw new Error(`建立 AI 錯誤情境失敗：${updateForErrorTest.status} ${await updateForErrorTest.text()}`);
  const reactivate = await fetch(`${apiBase}/workflows/${testId}/activate`, { method: 'POST', headers: apiHeaders });
  if (!reactivate.ok) throw new Error(`啟用 AI 錯誤情境失敗：${reactivate.status} ${await reactivate.text()}`);
  const aiError = await call('smoke-ai-error', '今天午餐 120 元現金', 'ai-error-1');
  if (aiError?.errorType !== 'ai_recognition') throw new Error(`AI 失敗時沒有回覆辨識錯誤：${JSON.stringify(aiError)}`);
  if (!String(aiError?.messages?.[0]?.altText || '').includes('沒有辨識成功')) throw new Error(`AI 錯誤提示內容不符：${JSON.stringify(aiError)}`);

  console.log(JSON.stringify({
    ok: true, testId, webhookPath, altText: merged.messages[0].altText,
    category: '油錢', payment: '玉山刷卡', clarificationMerged: true, restartConfirmed: true,
    aiErrorFallback: true,
  }, null, 2));
} finally {
  if (testId) {
    await fetch(`${apiBase}/workflows/${testId}/deactivate`, { method: 'POST', headers: apiHeaders }).catch(() => {});
    const remove = await fetch(`${apiBase}/workflows/${testId}`, { method: 'DELETE', headers: apiHeaders });
    if (!remove.ok && remove.status !== 404) console.error(`警告：測試 workflow 清理失敗 ${testId} ${remove.status}`);
  }
}
