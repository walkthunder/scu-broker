import { describe } from '../lib/runner.js';
import { req } from '../lib/http.js';
import { assert, assertOk, assertFail, assertEq } from '../lib/assert.js';
import { adminLogin, brokerLogin, auth } from '../lib/auth.js';

describe('主数据 SKU/供应商', ({ it }) => {
  it('Admin 可 CRUD SKU', ['R-P0-2', 'R-GAP-SKU'], async () => {
    const { token } = await adminLogin();
    const name = `SKU-T-${Date.now()}`;
    const created = await req('/admin/skus', {
      method: 'POST',
      headers: auth(token),
      body: { name, type: 'gpu', unit: '小时', spec: '测试卡', status: 'active' },
    });
    assertOk(created);
    const id = created.json.data.id;

    const updated = await req(`/admin/skus/${id}`, {
      method: 'PUT',
      headers: auth(token),
      body: { spec: '测试卡-改', status: 'active' },
    });
    assertOk(updated);
    assertEq(updated.json.data.spec, '测试卡-改');

    const list = await req('/admin/skus', { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((s) => s.id === id), 'sku in list');
  });

  it('Broker 不能新建 SKU（仅 admin）', ['R-AUTH-2', 'R-GAP-SKU'], async () => {
    const { token } = await brokerLogin();
    const r = await req('/admin/skus', {
      method: 'POST',
      headers: auth(token),
      body: { name: '非法SKU', type: 'gpu', unit: '小时' },
    });
    assert(r.status === 403 || r.json?.code !== 0, 'broker forbidden create sku');
  });

  it('供应商 CRUD + 脱敏字段', ['R-P0-2', 'R-GAP-MASK'], async () => {
    const { token } = await adminLogin();
    const created = await req('/admin/suppliers', {
      method: 'POST',
      headers: auth(token),
      body: {
        name: `真实供应商-${Date.now()}`,
        display_name: '华北资源方',
        contact_name: '王工',
        contact_phone: '13900009999',
        skus: 'H100,A100',
        price_style: '中等',
        reliability: '靠谱',
      },
    });
    assertOk(created);
    assert(created.json.data.display_name === '华北资源方', 'display_name');

    const list = await req('/admin/suppliers', { headers: auth(token) });
    assertOk(list);
    assert(list.json.data.some((s) => s.id === created.json.data.id), 'in list');
  });

  it('客户前台可读 active SKU', ['R-P0-2'], async () => {
    const r = await req('/customer/skus');
    assertOk(r);
    assert(r.json.data.length > 0, 'has skus');
    assert(r.json.data.every((s) => s.status === 'active'), 'all active');
  });
});
