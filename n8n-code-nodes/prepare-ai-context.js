const original = $('解析一句話與狀態').item.json;
const schema = $('讀取 Notion 分類設定').item.json || {};
const fallbackCategories = ['食物','服飾','日常用品','交通','稅收','手機費','油錢','停車費','休閒','宮廟','醫療','玉山存錢','卡費','暫付','罰單','車','工具','投資','酒煙','房貸','訂閱'];
const fallbackPayments = ['現金','街口支付','富邦轉帳','Line','玉山刷卡','富邦付款','遠傳扣款','台灣銀行扣款'];

const categories = schema.properties?.['支出類型']?.select?.options?.map((item) => item.name).filter(Boolean) || fallbackCategories;
const payments = schema.properties?.['付款方式']?.select?.options?.map((item) => item.name).filter(Boolean) || fallbackPayments;

const dateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long',
}).formatToParts(new Date());
const parts = Object.fromEntries(dateParts.map((part) => [part.type, part.value]));
const today = `${parts.year}-${parts.month}-${parts.day}`;

return [{ json: {
  userId: original.userId,
  replyToken: original.replyToken,
  message: original.message,
  lastPayment: original.lastPayment || '',
  clarificationContext: original.clarificationContext || null,
  today,
  weekday: parts.weekday,
  categories,
  payments,
} }];
