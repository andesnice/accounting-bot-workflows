// n8n Code node 回歸測試 —「記帳白名單授權」開放版
// 直接從 workflow JSON 撈該節點 jsCode 跑，不打 n8n/Notion/LINE。
// 跑法：node n8n-code-nodes/_test-liff-auth.js
'use strict';
const fs = require('fs');
const path = require('path');

const WF = path.join(__dirname, '..', '2.LIFF記帳API-白名單版.json');
const json = JSON.parse(fs.readFileSync(WF, 'utf8'));
const node = json.nodes.find(n => n.name === '記帳白名單授權');
if (!node) { console.error('找不到節點：記帳白名單授權'); process.exit(1); }
const CODE = node.parameters.jsCode;

let pass = 0, fail = 0;
function check(label, ok, got) {
  if (ok) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + (got !== undefined ? '　實際：' + JSON.stringify(got) : '')); }
}

// 執行器：假造 $ 與 $json。此節點只參照 $('解析記帳請求') 與 $json(=LINE profile)
function run(parsedRequest, lineProfile) {
  const $ = function (name) {
    const table = {
      '解析記帳請求': { item: { json: parsedRequest } }
    };
    if (!table[name]) throw new Error('未預期的節點參照：' + name);
    return table[name];
  };
  const $json = lineProfile;
  return new Function('$', '$json', CODE)($, $json)[0].json;
}

// 有效的 create 請求（已通過「解析記帳請求」清洗過的形狀）
const CREATE_REQ = {
  action: 'create', accessToken: 'tok', pageId: '',
  title: '午餐', category: '食物', payment: '現金', amount: 120, date: '2026-08-09'
};
const LIST_REQ   = { action: 'list',   accessToken: 'tok', pageId: '', title: '', category: '', payment: '', amount: 0, date: '' };
const DELETE_REQ = { action: 'delete', accessToken: 'tok', pageId: 'abc123', title: '', category: '', payment: '', amount: 0, date: '' };

const 韋銘 = { userId: 'Uc98ee0e068ab75b6258bcb90106d1031', displayName: '韋銘' };
const 路人 = { userId: 'Uffffffffffffffffffffffffffffffff', displayName: '路人甲' };
const 未登入 = {}; // LINE profile 驗證失敗（neverError → 空物件 / 無 userId）

console.log('\n[1] 舊行為不可退化：原白名單使用者（韋銘）仍能用');
(() => {
  const r = run(CREATE_REQ, 韋銘);
  check('韋銘 create → authorized=true', r.authorized === true, r);
  check('帶出 userId', r.userId === 韋銘.userId, r.userId);
  check('無錯誤訊息', r.message === '', r.message);
  const l = run(LIST_REQ, 韋銘);
  check('韋銘 list → authorized=true', l.authorized === true, l);
})();

console.log('\n[2] 新功能：任何其他登入使用者（路人）也能用');
(() => {
  const r = run(CREATE_REQ, 路人);
  check('路人 create → authorized=true', r.authorized === true, r);
  const l = run(LIST_REQ, 路人);
  check('路人 list → authorized=true', l.authorized === true, l);
  const d = run(DELETE_REQ, 路人);
  check('路人 delete（有 pageId）→ authorized=true', d.authorized === true, d);
  check('不再出現「沒有使用權限」訊息', r.message === '' && l.message === '' && d.message === '', [r.message, l.message, d.message]);
})();

console.log('\n[3] 邊界與防呆');
(() => {
  const noLogin = run(CREATE_REQ, 未登入);
  check('未登入（無 userId）→ authorized=false', noLogin.authorized === false, noLogin);
  check('未登入 → 提示重新開啟', noLogin.message === 'LINE 登入已失效，請關閉後重新開啟。', noLogin.message);

  const badAction = run(Object.assign({}, CREATE_REQ, { action: 'wipe' }), 路人);
  check('非法 action → authorized=false', badAction.authorized === false, badAction);

  const badCreate = run(Object.assign({}, CREATE_REQ, { amount: 0 }), 路人);
  check('create 缺金額 → authorized=false', badCreate.authorized === false, badCreate);
  check('缺欄位 → 提示內容不完整', badCreate.message === '記帳內容不完整。', badCreate.message);

  const badDate = run(Object.assign({}, CREATE_REQ, { date: '2026/08/09' }), 路人);
  check('create 日期格式錯 → authorized=false', badDate.authorized === false, badDate);

  const delNoId = run(Object.assign({}, DELETE_REQ, { pageId: '' }), 路人);
  check('delete 缺 pageId → authorized=false', delNoId.authorized === false, delNoId);
})();

console.log('\n[4] 未送的欄位不被杜撰');
(() => {
  const l = run(LIST_REQ, 路人);
  check('list 不需 pageId，仍 authorized', l.authorized === true, l);
  check('displayName 有帶出', l.displayName === 路人.displayName, l.displayName);
})();

console.log('\n通過 ' + pass + '　失敗 ' + fail);
process.exit(fail ? 1 : 0);
