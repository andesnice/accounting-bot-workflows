const source = $('準備 AI 分析資料').item.json;
const rawOutput = $json.output;
const parsed = rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput) ? rawOutput : {};
const staticData = $getWorkflowStaticData('global');
const store = staticData.oneLineAccounting ||= { pending: {}, lastPayment: {} };

function quickReply(text, actions = []) {
  const message = { type: 'text', text };
  if (actions.length) message.quickReply = { items: actions.slice(0, 13).map(([label, value]) => ({ type: 'action', action: { type: 'message', label, text: value } })) };
  return [message];
}
function row(label, value, color = '#334155') {
  return { type: 'box', layout: 'horizontal', margin: 'md', contents: [
    { type: 'text', text: label, size: 'sm', color: '#64748B', flex: 3 },
    { type: 'text', text: String(value), size: 'sm', color, weight: 'bold', align: 'end', wrap: true, flex: 7 },
  ] };
}
function confirmMessages(pending) {
  const amount = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(pending.amount);
  return [{ type: 'flex', altText: `請確認記帳 NT$${amount}`, contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#0F766E', contents: [
      { type: 'text', text: 'AI 已幫你整理', color: '#CCFBF1', size: 'xs', weight: 'bold' },
      { type: 'text', text: '確認這筆記帳', color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'sm' },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [
      { type: 'text', text: `NT$ ${amount}`, size: 'xxl', weight: 'bold', color: '#0F766E', align: 'center' },
      { type: 'separator', margin: 'xl', color: '#E2E8F0' },
      row('分類', pending.category), row('日期', pending.date), row('付款', pending.payment), row('備註', pending.note || '無'),
    ] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: [
      { type: 'button', style: 'primary', color: '#0F766E', height: 'sm', action: { type: 'message', label: '確認存入 Notion', text: '確認記帳' } },
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改分類', text: '修改分類' } },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改付款', text: '修改付款' } },
      ] },
      { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改金額', text: '修改金額' } },
        { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '取消', text: '取消記帳' } },
      ] },
    ] },
  } }];
}
function questionMessages(question) {
  return [{ type: 'flex', altText: '需要補充記帳資訊', contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#F59E0B', contents: [
      { type: 'text', text: '我還需要一點資訊', color: '#FFFFFF', size: 'lg', weight: 'bold' },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: [
      { type: 'text', text: question, wrap: true, color: '#1E293B', size: 'md' },
      { type: 'text', text: '直接回答問題，我會接續同一筆資料。', wrap: true, color: '#64748B', size: 'sm' },
    ] },
    footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '16px', contents: [
      { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '重新一筆', text: '重新一筆' } },
      { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '取消', text: '取消記帳' } },
    ] },
  } }];
}
function recognitionErrorMessages() {
  return [{ type: 'flex', altText: '這次沒有辨識成功，請再輸入一次', contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#DC2626', contents: [
      { type: 'text', text: '這次沒有辨識成功', color: '#FFFFFF', size: 'lg', weight: 'bold' },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'md', contents: [
      { type: 'text', text: '可能是內容不足，或 AI 暫時無法完成分析。請直接再傳一次完整內容。', wrap: true, color: '#1E293B', size: 'md' },
      { type: 'text', text: '例如：昨天中油加油 1500 元，用玉山卡。', wrap: true, color: '#64748B', size: 'sm' },
    ] },
    footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '16px', contents: [
      { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '查看輸入範例', text: '記帳說明' } },
      { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '取消', text: '取消記帳' } },
    ] },
  } }];
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00+08:00`);
  return !Number.isNaN(date.getTime()) && date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' }) === value;
}

const hasRecognizedOutput = ['date', 'amount', 'category', 'payment', 'note', 'needsClarification', 'question']
  .some((key) => Object.prototype.hasOwnProperty.call(parsed, key));
if ($json.error || !hasRecognizedOutput) {
  return [{ json: {
    userId: source.userId,
    replyToken: source.replyToken,
    action: 'reply',
    errorType: 'ai_recognition',
    messages: recognitionErrorMessages(),
  } }];
}

const previous = source.clarificationContext || {};
const parsedAmount = Number(parsed.amount);
const previousAmount = Number(previous.amount);
const amount = Number.isFinite(parsedAmount) && parsedAmount > 0
  ? parsedAmount
  : (Number.isFinite(previousAmount) && previousAmount > 0 ? previousAmount : null);
const categoryCandidate = parsed.category || previous.category || '';
const category = source.categories.includes(categoryCandidate) ? categoryCandidate : '';
const paymentCandidate = parsed.payment || previous.payment || '';
let payment = source.payments.includes(paymentCandidate) ? paymentCandidate : '';
if (!payment && source.payments.includes(source.lastPayment)) payment = source.lastPayment;
const date = validDate(parsed.date) ? parsed.date : (validDate(previous.date) ? previous.date : source.today);
const note = String(parsed.note || previous.note || '').trim().slice(0, 100);
const question = String(parsed.question || '').trim();

if (parsed.needsClarification || !amount) {
  const pending = {
    date, category, amount, payment, note,
    originalMessage: previous.originalMessage || source.message,
    question: question || '這筆消費還缺少什麼資訊？',
    updatedAt: Date.now(), waiting: 'clarification', saving: false,
  };
  store.pending[source.userId] = pending;
  return [{ json: { userId: source.userId, replyToken: source.replyToken, action: 'reply', messages: questionMessages(pending.question) } }];
}

const pending = { date, category, amount: Math.round(amount * 100) / 100, payment, note, updatedAt: Date.now(), waiting: '', saving: false };
store.pending[source.userId] = pending;

if (!category) {
  pending.waiting = 'category';
  const groups = ['飲食','生活','交通','帳單','健康','休閒','財務','其他'];
  return [{ json: { userId: source.userId, replyToken: source.replyToken, action: 'reply', messages: quickReply('AI 無法確定分類，請選擇分類群組：', [...groups.map((group) => [group, `分類群組:${group}`]), ['取消','取消記帳']]) } }];
}
if (!payment) {
  pending.waiting = 'payment';
  return [{ json: { userId: source.userId, replyToken: source.replyToken, action: 'reply', messages: quickReply('這筆是用什麼方式付款？', [...source.payments.map((item) => [item, `付款:${item}`]), ['取消','取消記帳']]) } }];
}

pending.waiting = 'confirm';
return [{ json: { userId: source.userId, replyToken: source.replyToken, action: 'reply', messages: confirmMessages(pending) } }];
