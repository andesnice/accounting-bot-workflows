import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORKFLOW_ID = 'chSXWYSK2S2unLgz';
const DATABASE_ID = 'dbe28d3510e049428ae29c62045a9769';
const SETTINGS_PATH = 'C:/Users/Nice/.claude/settings.local.json';
const deploy = process.argv.includes('--deploy');

const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
const apiBase = settings?.env?.N8N_API_BASE;
const apiKey = settings?.env?.N8N_API_KEY;
if (!apiBase || !apiKey) throw new Error('找不到 n8n API 設定');

const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
const response = await fetch(`${apiBase}/workflows/${WORKFLOW_ID}`, { headers });
if (!response.ok) throw new Error(`讀取正式 workflow 失敗：${response.status}`);
const workflow = await response.json();

if (!['LINE 一句話記帳 × Notion', 'Line 記帳機器人'].includes(workflow.name)) {
  throw new Error(`workflow 名稱不符，拒絕修改：${workflow.name}`);
}

const backupDir = path.join(ROOT, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'LINE一句話記帳-before-ai-20261011.json');
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
}
const optimizationBackupPath = path.join(backupDir, 'LINE一句話記帳-before-remove-recent-20261011.json');
if (!fs.existsSync(optimizationBackupPath)) {
  fs.writeFileSync(optimizationBackupPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
}
const dialogBackupPath = path.join(backupDir, 'LINE一句話記帳-before-dialog-state-20261011.json');
if (!fs.existsSync(dialogBackupPath)) {
  fs.writeFileSync(dialogBackupPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
}

const findNode = (name) => {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`找不到節點：${name}`);
  return node;
};

const notionCredential = structuredClone(findNode('新增 Notion 帳目').credentials);
const lineCredential = structuredClone(findNode('LINE 回覆').credentials);

const controllerCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/ai-controller.js'), 'utf8');

const prepareAiCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/prepare-ai-context.js'), 'utf8');

const aiPrompt = `=你是台灣個人記帳助理。請把使用者的口語描述整理成一筆記帳資料。

【台灣今天】{{ $json.today }}（{{ $json.weekday }}）
【使用者本輪輸入】{{ $json.message }}
【正在補充的上一筆資料；null 代表新的一筆】{{ JSON.stringify($json.clarificationContext) }}
【Notion 現有分類，只能擇一】{{ JSON.stringify($json.categories) }}
【Notion 現有付款方式，只能擇一或留空】{{ JSON.stringify($json.payments) }}
【上次付款方式】{{ $json.lastPayment || '無' }}

規則：
1. 如果有上一筆資料，必須把本輪輸入合併進上一筆；保留已知的日期、金額、分類、付款方式與備註，不得把本輪當成全新交易。
2. category 必須完全等於現有分類之一，不得創造新分類。依使用者語意判斷，不只比對關鍵字。
3. payment 只有在本輪或上一筆資料明示時才填現有付款方式；都沒說就留空，系統會沿用上次付款或追問。
4. date 輸出 YYYY-MM-DD。未提日期且上一筆也沒有日期時才用今天；正確理解昨天、前天、上週五、月底等台灣口語。
5. amount 必須是大於 0 的數字。可以理解中文數字與加總，例如「便當一百二、飲料五十」同屬一筆餐飲可加總為 170。
6. 如果一句話明顯包含多筆不同日期、不同分類或不同付款方式的獨立交易，不要硬合併；needsClarification=true，question 請使用者一次說一筆。
7. note 寫簡短清楚的消費內容或店家，移除日期、金額與付款方式；最多 100 字。
8. 資訊不足或無法可靠判斷金額時，needsClarification=true 並在 question 用繁體中文簡短追問。
9. 只輸出符合指定格式的資料。`;

const validateAiCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/validate-ai-result.js'), 'utf8');

const successCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/ai-success-flex.js'), 'utf8');

const failureCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/ai-failure-flex.js'), 'utf8');

findNode('解析一句話與狀態').parameters.jsCode = controllerCode;
findNode('清除待確認並組成功訊息').parameters.jsCode = successCode;
findNode('組 Notion 失敗訊息').parameters.jsCode = failureCode;
const setupNote = findNode('匯入後設定說明');
setupNote.parameters.content = `## AI 口語記帳（2026-10-11）

- 一般文字直接交給 Gemini 理解，不用輸入「記帳」。
- 每次只讀 Notion DB 結構，不查詢歷史帳目。
- AI 只能選 Notion 已存在的「支出類型」與「付款方式」。
- AI 解析後先回 Flex 確認卡，按「確認存入 Notion」才會寫入。
- AI 追問時保留上一筆資料；「重新一筆」需再次確認才會清除。
- Gemini credential：Google Gemini(PaLM) Api account。
- Notion credential：Notion account。
- LINE credential：GAS社畜崙。
- Webhook：/webhook/line-accounting-submit`;
setupNote.parameters.height = 380;
setupNote.parameters.width = 520;
setupNote.position = [0, -32];

const routeNode = workflow.nodes.find((node) => ['分流記帳動作', '是否確認寫入'].includes(node.name));
if (!routeNode) throw new Error('找不到分流節點：分流記帳動作／是否確認寫入');
routeNode.name = '分流記帳動作';
routeNode.type = 'n8n-nodes-base.switch';
routeNode.typeVersion = 3.4;
routeNode.position = [752, 432];
routeNode.parameters = {
  rules: {
    values: ['save', 'ai_parse', 'reply'].map((value) => ({
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [{
          id: crypto.randomUUID(), leftValue: '={{ $json.action }}', rightValue: value,
          operator: { type: 'string', operation: 'equals' },
        }],
        combinator: 'and',
      },
      renameOutput: true,
      outputKey: value,
    })),
  },
  options: { fallbackOutput: 'extra' },
};

const newNodes = [
  {
    parameters: {
      url: `https://api.notion.com/v1/databases/${DATABASE_ID}`,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'notionApi', options: {},
    },
    id: crypto.randomUUID(), name: '讀取 Notion 分類設定', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.3,
    position: [1008, 528], credentials: notionCredential, onError: 'continueRegularOutput',
  },
  {
    parameters: { jsCode: prepareAiCode }, id: crypto.randomUUID(), name: '準備 AI 分析資料',
    type: 'n8n-nodes-base.code', typeVersion: 2, position: [1248, 528],
  },
  {
    parameters: { promptType: 'define', text: aiPrompt, hasOutputParser: true, batching: {} },
    id: crypto.randomUUID(), name: 'AI 分析口語記帳', type: '@n8n/n8n-nodes-langchain.chainLlm', typeVersion: 1.7,
    position: [1488, 528], onError: 'continueRegularOutput',
  },
  {
    parameters: { options: { temperature: 0 } }, id: crypto.randomUUID(), name: 'Gemini 記帳模型',
    type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', typeVersion: 1, position: [1440, 768],
    credentials: { googlePalmApi: { id: 'urpOlF2Hj63J2lD4', name: 'Google Gemini(PaLM) Api account' } },
  },
  {
    parameters: {
      jsonSchemaExample: JSON.stringify({
        date: '2026-10-11', amount: 185, category: '食物', payment: '現金',
        note: '午餐便當和飲料', needsClarification: false, question: '',
      }, null, 2),
    },
    id: crypto.randomUUID(), name: 'AI 記帳輸出格式', type: '@n8n/n8n-nodes-langchain.outputParserStructured', typeVersion: 1.2,
    position: [1632, 768],
  },
  {
    parameters: { jsCode: validateAiCode }, id: crypto.randomUUID(), name: '驗證 AI 結果並組卡片',
    type: 'n8n-nodes-base.code', typeVersion: 2, position: [1744, 528],
  },
];

const replaceNames = new Set([...newNodes.map((node) => node.name), '讀取最近 30 筆帳目']);
workflow.nodes = workflow.nodes.filter((node) => !replaceNames.has(node.name));
workflow.nodes.push(...newNodes);

findNode('新增 Notion 帳目').position = [1024, 240];
findNode('清除待確認並組成功訊息').position = [1296, 176];
findNode('組 Notion 失敗訊息').position = [1296, 304];
findNode('LINE 回覆').position = [2256, 432];

workflow.connections = {
  'LINE 一句話記帳 Webhook': { main: [[{ node: '解析 LINE 事件', type: 'main', index: 0 }]] },
  '解析 LINE 事件': { main: [[{ node: '解析一句話與狀態', type: 'main', index: 0 }]] },
  '解析一句話與狀態': { main: [[{ node: '分流記帳動作', type: 'main', index: 0 }]] },
  '分流記帳動作': { main: [
    [{ node: '新增 Notion 帳目', type: 'main', index: 0 }],
    [{ node: '讀取 Notion 分類設定', type: 'main', index: 0 }],
    [{ node: 'LINE 回覆', type: 'main', index: 0 }],
    [{ node: 'LINE 回覆', type: 'main', index: 0 }],
  ] },
  '讀取 Notion 分類設定': { main: [[{ node: '準備 AI 分析資料', type: 'main', index: 0 }]] },
  '準備 AI 分析資料': { main: [[{ node: 'AI 分析口語記帳', type: 'main', index: 0 }]] },
  'Gemini 記帳模型': { ai_languageModel: [[{ node: 'AI 分析口語記帳', type: 'ai_languageModel', index: 0 }]] },
  'AI 記帳輸出格式': { ai_outputParser: [[{ node: 'AI 分析口語記帳', type: 'ai_outputParser', index: 0 }]] },
  'AI 分析口語記帳': { main: [[{ node: '驗證 AI 結果並組卡片', type: 'main', index: 0 }]] },
  '驗證 AI 結果並組卡片': { main: [[{ node: 'LINE 回覆', type: 'main', index: 0 }]] },
  '新增 Notion 帳目': { main: [
    [{ node: '清除待確認並組成功訊息', type: 'main', index: 0 }],
    [{ node: '組 Notion 失敗訊息', type: 'main', index: 0 }],
  ] },
  '清除待確認並組成功訊息': { main: [[{ node: 'LINE 回覆', type: 'main', index: 0 }]] },
  '組 Notion 失敗訊息': { main: [[{ node: 'LINE 回覆', type: 'main', index: 0 }]] },
  'LINE 回覆': { main: [[]] },
};

const names = new Set(workflow.nodes.map((node) => node.name));
for (const [source, groups] of Object.entries(workflow.connections)) {
  if (!names.has(source)) throw new Error(`連線來源不存在：${source}`);
  for (const outputs of Object.values(groups)) {
    for (const output of outputs) {
      for (const edge of output) if (!names.has(edge.node)) throw new Error(`連線目標不存在：${edge.node}`);
    }
  }
}

const localPath = path.join(ROOT, 'LINE 一句話記帳 × Notion.json');
fs.writeFileSync(localPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

if (deploy) {
  const body = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: workflow.settings?.executionOrder || 'v1' },
  };
  const put = await fetch(`${apiBase}/workflows/${WORKFLOW_ID}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  });
  const resultText = await put.text();
  if (!put.ok) throw new Error(`更新正式 workflow 失敗：${put.status} ${resultText}`);
  const result = JSON.parse(resultText);
  console.log(JSON.stringify({ deployed: true, id: result.id, name: result.name, active: result.active, nodes: result.nodes?.length }, null, 2));
} else {
  console.log(JSON.stringify({ built: true, id: workflow.id, active: workflow.active, nodes: workflow.nodes.length, localPath, backupPath }, null, 2));
}
