const original = $('解析一句話與狀態').item.json;
const staticData = $getWorkflowStaticData('global');
const store = staticData.oneLineAccounting ||= { pending: {}, lastPayment: {} };
delete store.pending[original.userId];
store.lastPayment[original.userId] = original.payment;
const amount = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 }).format(original.amount);
const rawNotionUrl = String($json.url || '').trim();
const notionUrl = /^https:\/\/(?:app\.notion\.com|(?:www\.)?notion\.so)\//i.test(rawNotionUrl)
  ? rawNotionUrl
  : '';
const footerContents = [];
if (notionUrl) {
  footerContents.push({
    type: 'button', style: 'primary', color: '#16A34A', height: 'sm',
    action: { type: 'uri', label: '開啟 Notion', uri: notionUrl },
  });
}
footerContents.push({
  type: 'button', style: 'secondary', height: 'sm',
  action: { type: 'message', label: '再記一筆', text: '記帳說明' },
});

return { json: {
  replyToken: original.replyToken,
  messages: [{ type: 'flex', altText: `記帳成功 NT$${amount}`, contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#16A34A', contents: [
      { type: 'text', text: '✓ 已存入 Notion', color: '#DCFCE7', size: 'sm', weight: 'bold' },
      { type: 'text', text: '記帳完成', color: '#FFFFFF', size: 'xl', weight: 'bold', margin: 'sm' },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [
      { type: 'text', text: `NT$ ${amount}`, size: 'xxl', weight: 'bold', color: '#15803D', align: 'center' },
      { type: 'separator', margin: 'xl', color: '#E2E8F0' },
      { type: 'text', text: `${original.category} · ${original.payment}`, align: 'center', margin: 'lg', color: '#334155', weight: 'bold' },
      { type: 'text', text: original.note || '無備註', align: 'center', margin: 'sm', color: '#64748B', wrap: true },
      { type: 'text', text: original.date, align: 'center', margin: 'sm', color: '#94A3B8', size: 'sm' },
    ] },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px', contents: footerContents },
  } }],
} };
