const staticData = $getWorkflowStaticData('global');
const store = staticData.oneLineAccounting ||= { pending: {}, lastPayment: {} };
const TTL_MS = 10 * 60 * 1000;
const now = Date.now();

for (const [key, value] of Object.entries(store.pending)) {
  if (!value?.updatedAt || now - value.updatedAt > TTL_MS) delete store.pending[key];
}

const categories = [
  '食物', '服飾', '日常用品', '交通', '稅收', '手機費', '油錢', '停車費',
  '休閒', '宮廟', '醫療', '玉山存錢', '卡費', '暫付', '罰單', '車',
  '工具', '投資', '酒煙', '房貸', '訂閱',
];
const payments = [
  '現金', '街口支付', '富邦轉帳', 'Line', '玉山刷卡', '富邦付款',
  '遠傳扣款', '台灣銀行扣款',
];
const categoryGroups = {
  '飲食': ['食物', '酒煙'],
  '生活': ['服飾', '日常用品'],
  '交通': ['交通', '油錢', '停車費', '罰單', '車'],
  '帳單': ['稅收', '手機費', '卡費', '房貸', '訂閱'],
  '健康': ['醫療'],
  '休閒': ['休閒', '宮廟'],
  '財務': ['玉山存錢', '暫付', '投資'],
  '其他': ['工具'],
};
const paymentAliases = [
  ['台灣銀行扣款', '台灣銀行扣款'], ['台銀扣款', '台灣銀行扣款'],
  ['遠傳扣款', '遠傳扣款'], ['富邦轉帳', '富邦轉帳'], ['富邦付款', '富邦付款'],
  ['玉山刷卡', '玉山刷卡'], ['玉山卡', '玉山刷卡'], ['刷玉山', '玉山刷卡'],
  ['街口支付', '街口支付'], ['街口', '街口支付'],
  ['line pay', 'Line'], ['linepay', 'Line'], ['line', 'Line'],
  ['現金', '現金'], ['付現', '現金'],
].sort((a, b) => b[0].length - a[0].length);

function quickReply(text, actions = []) {
  const message = { type: 'text', text };
  if (actions.length) {
    message.quickReply = {
      items: actions.slice(0, 13).map(([label, value]) => ({
        type: 'action', action: { type: 'message', label, text: value },
      })),
    };
  }
  return [message];
}

function reply(base, text, actions = []) {
  return { ...base, action: 'reply', messages: quickReply(text, actions) };
}

function row(label, value, color = '#334155') {
  return {
    type: 'box', layout: 'horizontal', margin: 'md',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#64748B', flex: 3 },
      { type: 'text', text: String(value), size: 'sm', color, weight: 'bold', align: 'end', wrap: true, flex: 7 },
    ],
  };
}

function confirmMessages(pending) {
  const amount = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(pending.amount);
  return [{
    type: 'flex',
    altText: `請確認記帳 NT$${amount}`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#0F766E',
        contents: [
          { type: 'text', text: 'AI 已幫你整理', color: '#CCFBF1', size: 'xs', weight: 'bold' },
          { type: 'text', text: '確認這筆記帳', color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '20px',
        contents: [
          { type: 'text', text: `NT$ ${amount}`, size: 'xxl', weight: 'bold', color: '#0F766E', align: 'center' },
          { type: 'separator', margin: 'xl', color: '#E2E8F0' },
          row('分類', pending.category), row('日期', pending.date), row('付款', pending.payment),
          row('備註', pending.note || '無'),
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'button', style: 'primary', color: '#0F766E', height: 'sm', action: { type: 'message', label: '確認存入 Notion', text: '確認記帳' } },
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改分類', text: '修改分類' } },
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改付款', text: '修改付款' } },
          ] },
          { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '改金額', text: '修改金額' } },
            { type: 'button', style: 'secondary', height: 'sm', action: { type: 'message', label: '取消', text: '取消記帳' } },
          ] },
        ],
      },
    },
  }];
}

function helpMessages() {
  return [{
    type: 'flex', altText: '口語記帳使用說明',
    contents: {
      type: 'bubble', size: 'mega',
      header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#1D4ED8', contents: [
        { type: 'text', text: '口語記帳', color: '#FFFFFF', size: 'xl', weight: 'bold' },
        { type: 'text', text: '像聊天一樣告訴我就好', color: '#DBEAFE', size: 'sm', margin: 'sm' },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '20px', contents: [
        { type: 'text', text: '可以這樣說：', weight: 'bold', color: '#1E293B' },
        { type: 'text', text: '「昨天去中油加了 1350，用玉山卡」', wrap: true, color: '#334155' },
        { type: 'text', text: '「午餐便當跟飲料一共 185，付現」', wrap: true, color: '#334155' },
        { type: 'text', text: '「上週五 Netflix 扣了 390」', wrap: true, color: '#334155' },
        { type: 'separator', margin: 'md', color: '#E2E8F0' },
        { type: 'text', text: 'AI 會參考 Notion 最近紀錄與現有分類，再讓你確認後存入。', wrap: true, size: 'sm', color: '#64748B' },
      ] },
    },
  }];
}

function parsePayment(text) {
  const lower = String(text).toLowerCase();
  const found = paymentAliases.find(([alias]) => lower.includes(alias.toLowerCase()));
  return found?.[1] || '';
}

function parseAmount(text) {
  const clean = String(text).replace(/,/g, '').replace(/\s/g, '');
  if (!/^\d+(?:\.\d+)?(?:[+-]\d+(?:\.\d+)?)*$/.test(clean)) return null;
  const tokens = clean.match(/[+-]?\d+(?:\.\d+)?/g) || [];
  const amount = tokens.reduce((sum, token) => sum + Number(token), 0);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function categoryPrompt(base, pending, intro = '請選擇分類群組：') {
  pending.waiting = 'category'; pending.saving = false; pending.updatedAt = Date.now();
  store.pending[base.userId] = pending;
  const actions = Object.keys(categoryGroups).map((group) => [group, `分類群組:${group}`]);
  actions.push(['取消', '取消記帳']);
  return reply(base, intro, actions);
}

function paymentPrompt(base, pending, intro = '請選擇付款方式：') {
  pending.waiting = 'payment'; pending.saving = false; pending.updatedAt = Date.now();
  store.pending[base.userId] = pending;
  const actions = payments.map((payment) => [payment, `付款:${payment}`]);
  actions.push(['取消', '取消記帳']);
  return reply(base, intro, actions);
}

function amountPrompt(base, pending, intro = '請輸入正確金額，例如：120 或 100+50') {
  pending.waiting = 'amount'; pending.saving = false; pending.updatedAt = Date.now();
  store.pending[base.userId] = pending;
  return reply(base, intro, [['取消', '取消記帳']]);
}

function confirmPrompt(base, pending) {
  pending.waiting = 'confirm'; pending.saving = false; pending.updatedAt = Date.now();
  store.pending[base.userId] = pending;
  return { ...base, action: 'reply', messages: confirmMessages(pending) };
}

function nextStep(base, pending) {
  if (!pending.amount) return amountPrompt(base, pending);
  if (!pending.category) return categoryPrompt(base, pending);
  if (!pending.payment) return paymentPrompt(base, pending);
  return confirmPrompt(base, pending);
}

function handle(input) {
  const base = { userId: input.userId || '', replyToken: input.replyToken || '', webhookEventId: input.webhookEventId || '' };
  const message = String(input.message || '').trim();
  if (!base.userId || !base.replyToken || !message) return null;
  let pending = store.pending[base.userId];

  if (message === '取消記帳' || message === '取消') {
    delete store.pending[base.userId];
    return reply(base, '已取消這筆記帳。隨時再告訴我下一筆支出。');
  }
  if (message === '記帳' || message === '記帳說明' || message === '說明' || message === '幫助') {
    return { ...base, action: 'reply', messages: helpMessages() };
  }
  if (message === '重新一筆') {
    if (!pending) return reply(base, '目前沒有待補充的記帳，請直接輸入新的一筆。');
    pending.resumeWaiting = pending.waiting || 'clarification';
    pending.waiting = 'restart_confirm'; pending.updatedAt = Date.now();
    store.pending[base.userId] = pending;
    return reply(base, '確定要放棄目前這筆，重新輸入嗎？', [
      ['確認重新一筆', '確認重新一筆'], ['繼續這筆', '繼續這筆'],
    ]);
  }
  if (message === '確認重新一筆') {
    delete store.pending[base.userId];
    return reply(base, '已清除目前資料，請直接輸入新的一筆記帳。');
  }
  if (message === '繼續這筆') {
    if (!pending) return reply(base, '待補充資料已過期，請直接重新描述這筆支出。');
    pending.waiting = pending.resumeWaiting || 'clarification';
    delete pending.resumeWaiting;
    pending.updatedAt = Date.now(); store.pending[base.userId] = pending;
    if (pending.waiting === 'clarification') {
      return reply(base, pending.question || '請繼續補充這筆記帳資訊。', [
        ['重新一筆', '重新一筆'], ['取消', '取消記帳'],
      ]);
    }
    return nextStep(base, pending);
  }
  if (message === '確認記帳') {
    if (!pending) return reply(base, '待確認資料已過期，請直接重新描述這筆支出。');
    if (pending.saving) return reply(base, '正在寫入 Notion，請稍候，不用重複按確認。');
    if (!pending.amount || !pending.category || !pending.payment) return nextStep(base, pending);
    pending.saving = true; pending.updatedAt = Date.now(); store.pending[base.userId] = pending;
    return { ...base, action: 'save', title: String(pending.note || pending.category).slice(0, 100), note: String(pending.note || '').slice(0, 100), category: pending.category, amount: pending.amount, payment: pending.payment, date: pending.date };
  }
  if (message.startsWith('分類群組:')) {
    if (!pending) return reply(base, '待確認資料已過期，請直接重新描述這筆支出。');
    const group = message.slice('分類群組:'.length).trim();
    const options = categoryGroups[group];
    if (!options) return categoryPrompt(base, pending, '找不到這個群組，請重新選擇：');
    const actions = options.map((category) => [category, `類別:${category}`]);
    actions.push(['取消', '取消記帳']);
    return reply(base, `請選擇「${group}」的細分類：`, actions);
  }
  if (message.startsWith('類別:')) {
    if (!pending) return reply(base, '待確認資料已過期，請直接重新描述這筆支出。');
    const category = message.slice('類別:'.length).trim();
    if (!categories.includes(category)) return categoryPrompt(base, pending, '分類不在允許清單，請重新選擇：');
    pending.category = category; pending.updatedAt = Date.now();
    return nextStep(base, pending);
  }
  if (message.startsWith('付款:')) {
    if (!pending) return reply(base, '待確認資料已過期，請直接重新描述這筆支出。');
    const payment = message.slice('付款:'.length).trim();
    if (!payments.includes(payment)) return paymentPrompt(base, pending, '付款方式不在允許清單，請重新選擇：');
    pending.payment = payment; pending.updatedAt = Date.now();
    return nextStep(base, pending);
  }
  if (message === '修改分類') return pending ? categoryPrompt(base, pending) : reply(base, '待確認資料已過期，請重新描述。');
  if (message === '修改付款') return pending ? paymentPrompt(base, pending) : reply(base, '待確認資料已過期，請重新描述。');
  if (message === '修改金額') return pending ? amountPrompt(base, pending) : reply(base, '待確認資料已過期，請重新描述。');

  if (pending?.waiting === 'amount') {
    const amount = parseAmount(message);
    if (!amount) return amountPrompt(base, pending);
    pending.amount = amount; pending.updatedAt = Date.now();
    return nextStep(base, pending);
  }
  if (pending?.waiting === 'category') {
    const category = categories.includes(message) ? message : '';
    if (!category) return categoryPrompt(base, pending, '請使用下方按鈕選擇分類：');
    pending.category = category; pending.updatedAt = Date.now();
    return nextStep(base, pending);
  }
  if (pending?.waiting === 'payment') {
    const payment = payments.includes(message) ? message : parsePayment(message);
    if (!payment) return paymentPrompt(base, pending, '請使用下方按鈕選擇付款方式：');
    pending.payment = payment; pending.updatedAt = Date.now();
    return nextStep(base, pending);
  }
  if (pending?.waiting === 'restart_confirm') {
    return reply(base, '請確認要重新開始，或繼續補充目前這筆：', [
      ['確認重新一筆', '確認重新一筆'], ['繼續這筆', '繼續這筆'],
    ]);
  }
  if (pending?.waiting === 'clarification') {
    return {
      ...base,
      action: 'ai_parse',
      message,
      lastPayment: store.lastPayment[base.userId] || '',
      clarificationContext: {
        originalMessage: pending.originalMessage || '',
        date: pending.date || '',
        amount: pending.amount || null,
        category: pending.category || '',
        payment: pending.payment || '',
        note: pending.note || '',
        question: pending.question || '',
      },
    };
  }

  return { ...base, action: 'ai_parse', message, lastPayment: store.lastPayment[base.userId] || '' };
}

const output = [];
for (const [index, item] of $input.all().entries()) {
  const result = handle(item.json);
  if (result) output.push({ json: result, pairedItem: { item: index } });
}
return output;
