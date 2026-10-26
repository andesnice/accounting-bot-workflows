import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORKFLOW_ID = 'chSXWYSK2S2unLgz';
const SETTINGS_PATH = 'C:/Users/Nice/.claude/settings.local.json';
const SUCCESS_NODE = '清除待確認並組成功訊息';

const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
const apiBase = settings?.env?.N8N_API_BASE?.replace(/\/$/, '');
const apiKey = settings?.env?.N8N_API_KEY;
if (!apiBase || !apiKey) throw new Error('找不到 n8n API 設定');

const headers = { 'X-N8N-API-KEY': apiKey, 'Content-Type': 'application/json' };
const getWorkflow = async () => {
  const response = await fetch(`${apiBase}/workflows/${WORKFLOW_ID}`, { headers });
  if (!response.ok) throw new Error(`讀取正式 workflow 失敗：${response.status}`);
  return response.json();
};

const workflow = await getWorkflow();
if (!['LINE 一句話記帳 × Notion', 'Line 記帳機器人'].includes(workflow.name)) {
  throw new Error(`workflow 名稱不符，拒絕修改：${workflow.name}`);
}
const webhookBefore = workflow.nodes.find((node) => node.name === 'LINE 一句話記帳 Webhook')?.webhookId;
const successNode = workflow.nodes.find((node) => node.name === SUCCESS_NODE);
if (!successNode) throw new Error(`找不到節點：${SUCCESS_NODE}`);

const backupDir = path.join(ROOT, 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, 'Line記帳機器人-before-notion-link-20261025.json');
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');

successNode.parameters.jsCode = fs.readFileSync(path.join(ROOT, 'n8n-code-nodes/ai-success-flex.js'), 'utf8');
const put = await fetch(`${apiBase}/workflows/${WORKFLOW_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: { executionOrder: workflow.settings?.executionOrder || 'v1' },
  }),
});
const putText = await put.text();
if (!put.ok) throw new Error(`更新正式 workflow 失敗：${put.status} ${putText}`);

const verified = await getWorkflow();
const verifiedNode = verified.nodes.find((node) => node.name === SUCCESS_NODE);
const webhookAfter = verified.nodes.find((node) => node.name === 'LINE 一句話記帳 Webhook')?.webhookId;
if (!verified.active) throw new Error('更新後 workflow 不是啟用狀態');
if (!webhookBefore || webhookAfter !== webhookBefore) throw new Error('Webhook ID 在更新後發生變動');
if (!verifiedNode?.parameters?.jsCode?.includes("label: '開啟 Notion'")) throw new Error('正式節點未出現 Notion 按鈕');

const localPath = path.join(ROOT, 'LINE 一句話記帳 × Notion.json');
fs.writeFileSync(localPath, `${JSON.stringify(verified, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  deployed: true,
  id: verified.id,
  name: verified.name,
  active: verified.active,
  nodeCount: verified.nodes.length,
  webhookId: webhookAfter,
  successNode: SUCCESS_NODE,
  backupPath,
  localPath,
}, null, 2));
