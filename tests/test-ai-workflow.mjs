import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = JSON.parse(fs.readFileSync('LINE 一句話記帳 × Notion.json', 'utf8'));
const node = (name) => workflow.nodes.find((item) => item.name === name);

assert.equal(workflow.id, 'chSXWYSK2S2unLgz');
assert.equal(workflow.nodes.length, 15);
assert.ok(node('AI 分析口語記帳'));
assert.equal(node('AI 分析口語記帳').onError, 'continueRegularOutput');
assert.ok(node('Gemini 記帳模型')?.credentials?.googlePalmApi?.id);
assert.equal(node('讀取最近 30 筆帳目'), undefined);
assert.doesNotMatch(node('AI 分析口語記帳').parameters.text, /最近 30 筆|recentExamples/);

const names = new Set(workflow.nodes.map((item) => item.name));
for (const [source, groups] of Object.entries(workflow.connections)) {
  assert.ok(names.has(source), `連線來源不存在：${source}`);
  for (const outputs of Object.values(groups)) {
    for (const output of outputs) {
      for (const edge of output) assert.ok(names.has(edge.node), `連線目標不存在：${edge.node}`);
    }
  }
}

const refs = new Set([...JSON.stringify(workflow).matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]));
assert.deepEqual([...refs].filter((name) => !names.has(name)), []);

const state = {};
const controller = new Function('$getWorkflowStaticData', '$input', node('解析一句話與狀態').parameters.jsCode);
const runController = (message, userId = 'user-1') => controller(
  () => state,
  { all: () => [{ json: { userId, replyToken: `reply-${userId}`, message, webhookEventId: `event-${userId}-${message}` } }] },
)[0]?.json;

let result = runController('昨天去中油加了 1350，用玉山卡');
assert.equal(result.action, 'ai_parse');
assert.equal(result.message, '昨天去中油加了 1350，用玉山卡');

result = runController('記帳說明', 'help-user');
assert.equal(result.action, 'reply');
assert.equal(result.messages[0].type, 'flex');
assert.match(result.messages[0].altText, /口語記帳/);

const source = {
  userId: 'user-1', replyToken: 'reply-user-1', message: '昨天去中油加了 1350，用玉山卡',
  lastPayment: '', today: '2026-10-11', weekday: 'Sunday',
  categories: ['食物', '油錢', '停車費'], payments: ['現金', '玉山刷卡', 'Line'],
};
const validate = new Function('$json', '$getWorkflowStaticData', '$', node('驗證 AI 結果並組卡片').parameters.jsCode);
const lookup = (name) => {
  if (name === '準備 AI 分析資料') return { item: { json: source } };
  throw new Error(`Unexpected lookup: ${name}`);
};

result = validate(
  { output: { date: '2026-10-10', amount: 1350, category: '油錢', payment: '玉山刷卡', note: '中油加油', needsClarification: false, question: '' } },
  () => state,
  lookup,
)[0].json;
assert.equal(result.action, 'reply');
assert.equal(result.messages[0].type, 'flex');
assert.match(result.messages[0].altText, /1,350/);
assert.equal(state.oneLineAccounting.pending['user-1'].category, '油錢');

result = validate(
  { error: { message: 'Model output does not fit required format' } },
  () => state,
  lookup,
)[0].json;
assert.equal(result.action, 'reply');
assert.equal(result.errorType, 'ai_recognition');
assert.equal(result.messages[0].type, 'flex');
assert.match(result.messages[0].altText, /沒有辨識成功/);

result = validate(
  { output: {} },
  () => state,
  lookup,
)[0].json;
assert.equal(result.errorType, 'ai_recognition');
assert.match(result.messages[0].contents.body.contents[0].text, /再傳一次/);

result = runController('確認記帳');
assert.equal(result.action, 'save');
assert.equal(result.amount, 1350);
assert.equal(result.category, '油錢');

const clarifySource = { ...source, userId: 'clarify', replyToken: 'reply-clarify' };
result = validate(
  { output: { date: '2026-10-10', amount: 1500, category: '', payment: '玉山刷卡', note: '', needsClarification: true, question: '這筆消費了什麼？' } },
  () => state,
  (name) => name === '準備 AI 分析資料' ? { item: { json: clarifySource } } : lookup(name),
)[0].json;
assert.equal(result.messages[0].type, 'flex');
assert.match(result.messages[0].contents.body.contents[0].text, /消費了什麼/);
const clarificationFlex = result.messages[0];
assert.equal(state.oneLineAccounting.pending.clarify.amount, 1500);
assert.equal(state.oneLineAccounting.pending.clarify.payment, '玉山刷卡');
assert.equal(state.oneLineAccounting.pending.clarify.waiting, 'clarification');

result = runController('加油', 'clarify');
assert.equal(result.action, 'ai_parse');
assert.equal(result.message, '加油');
assert.equal(result.clarificationContext.amount, 1500);
assert.equal(result.clarificationContext.payment, '玉山刷卡');

const mergedSource = { ...clarifySource, message: '加油', clarificationContext: result.clarificationContext };
result = validate(
  { output: { date: '2026-10-10', amount: 1500, category: '油錢', payment: '玉山刷卡', note: '加油', needsClarification: false, question: '' } },
  () => state,
  (name) => name === '準備 AI 分析資料' ? { item: { json: mergedSource } } : lookup(name),
)[0].json;
assert.match(result.messages[0].altText, /1,500/);
const mergedFlex = result.messages[0];
assert.equal(state.oneLineAccounting.pending.clarify.category, '油錢');

const restartSource = { ...clarifySource, userId: 'restart-user', replyToken: 'reply-restart' };
validate(
  { output: { date: '2026-10-10', amount: 1500, category: '', payment: '玉山刷卡', note: '', needsClarification: true, question: '這筆消費了什麼？' } },
  () => state,
  (name) => name === '準備 AI 分析資料' ? { item: { json: restartSource } } : lookup(name),
);
result = runController('重新一筆', 'restart-user');
assert.match(result.messages[0].text, /確定要放棄/);
assert.equal(state.oneLineAccounting.pending['restart-user'].waiting, 'restart_confirm');
result = runController('確認重新一筆', 'restart-user');
assert.match(result.messages[0].text, /已清除/);
assert.equal(state.oneLineAccounting.pending['restart-user'], undefined);

for (const message of [clarificationFlex, mergedFlex]) {
  assert.ok(message.altText.length <= 400);
  assert.equal(message.contents.type, 'bubble');
}

const successState = { oneLineAccounting: { pending: { 'saved-user': { amount: 1350 } }, lastPayment: {} } };
const successOriginal = {
  userId: 'saved-user', replyToken: 'reply-saved', amount: 1350,
  category: '油錢', payment: '玉山刷卡', note: '中油加油', date: '2026-10-25',
};
const success = new Function('$json', '$getWorkflowStaticData', '$', node('清除待確認並組成功訊息').parameters.jsCode);
result = success(
  { id: 'notion-page-id', url: 'https://app.notion.com/p/notion-page-id' },
  () => successState,
  (name) => name === '解析一句話與狀態' ? { item: { json: successOriginal } } : lookup(name),
).json;
const successButtons = result.messages[0].contents.footer.contents;
assert.equal(successButtons.length, 2);
assert.equal(successButtons[0].action.type, 'uri');
assert.equal(successButtons[0].action.label, '開啟 Notion');
assert.equal(successButtons[0].action.uri, 'https://app.notion.com/p/notion-page-id');
assert.equal(successButtons[1].action.type, 'message');
assert.equal(successState.oneLineAccounting.pending['saved-user'], undefined);

result = success(
  { id: 'notion-page-id' },
  () => successState,
  (name) => name === '解析一句話與狀態' ? { item: { json: successOriginal } } : lookup(name),
).json;
assert.equal(result.messages[0].contents.footer.contents.length, 1);
assert.equal(result.messages[0].contents.footer.contents[0].action.type, 'message');

console.log('AI accounting workflow tests passed');
