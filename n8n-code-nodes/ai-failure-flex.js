const original = $('解析一句話與狀態').item.json;
const staticData = $getWorkflowStaticData('global');
const store = staticData.oneLineAccounting ||= { pending: {}, lastPayment: {} };
if (store.pending[original.userId]) {
  store.pending[original.userId].saving = false;
  store.pending[original.userId].updatedAt = Date.now();
}
return { json: {
  replyToken: original.replyToken,
  messages: [{ type: 'flex', altText: 'Notion 寫入失敗', contents: {
    type: 'bubble', size: 'mega',
    header: { type: 'box', layout: 'vertical', paddingAll: '18px', backgroundColor: '#DC2626', contents: [
      { type: 'text', text: '寫入失敗', color: '#FFFFFF', size: 'lg', weight: 'bold' },
    ] },
    body: { type: 'box', layout: 'vertical', paddingAll: '20px', contents: [
      { type: 'text', text: '資料仍保留，請稍後重試或取消。', wrap: true, color: '#334155' },
    ] },
    footer: { type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '16px', contents: [
      { type: 'button', style: 'primary', color: '#DC2626', action: { type: 'message', label: '重試', text: '確認記帳' } },
      { type: 'button', style: 'secondary', action: { type: 'message', label: '取消', text: '取消記帳' } },
    ] },
  } }],
} };