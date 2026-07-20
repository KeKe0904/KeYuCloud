// 雨云 API 综合验证脚本 — 检查所有已实现的端点
const axios = require('axios');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE = 'https://api.v2.rainyun.com';

function decrypt(encrypted, secret) {
  const key = crypto.createHash('sha256').update(secret).digest();
  const [ivHex, dataHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

async function callApi(apiKey, method, path, params, body) {
  const url = `${BASE}${path}`;
  try {
    const res = await axios.request({
      method, url, params, data: body,
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  } catch (e) {
    return { status: e.response?.status || 500, error: e.message, data: e.response?.data };
  }
}

function summary(name, result, sampleKeys) {
  const code = result.data?.code;
  const ok = result.status === 200 && (code === undefined || code === 200);
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  console.log(`   HTTP ${result.status}, code=${code ?? '-'}, msg=${result.data?.message || '-'}`);
  if (ok && result.data?.data !== undefined) {
    const d = result.data.data;
    if (Array.isArray(d)) {
      console.log(`   返回数组: ${d.length} 条`);
      if (d.length && sampleKeys) {
        const sample = d[0];
        console.log(`   首条字段: ${Object.keys(sample).join(', ')}`);
        if (typeof sample === 'object') {
          const picked = {};
          for (const k of sampleKeys) if (sample[k] !== undefined) picked[k] = sample[k];
          console.log(`   首条样本: ${JSON.stringify(picked).slice(0, 300)}`);
        }
      }
    } else if (d && typeof d === 'object') {
      const keys = Object.keys(d);
      console.log(`   返回对象: ${keys.length} 字段 → ${keys.slice(0, 10).join(', ')}`);
      if (sampleKeys) {
        const picked = {};
        for (const k of sampleKeys) if (d[k] !== undefined) picked[k] = d[k];
        if (Object.keys(picked).length) console.log(`   关键字段: ${JSON.stringify(picked).slice(0, 300)}`);
      }
    } else {
      console.log(`   返回值: ${JSON.stringify(d).slice(0, 200)}`);
    }
  }
  return ok;
}

(async () => {
  const secret = process.env.AES_SECRET;
  if (!secret) { console.error('AES_SECRET 未设置'); process.exit(1); }

  const cfg = await prisma.rainyunConfig.findUnique({ where: { id: 1 } });
  if (!cfg) { console.error('RainyunConfig 不存在'); process.exit(1); }
  const apiKey = decrypt(cfg.apiKeyEnc, secret);
  console.log(`==========================================`);
  console.log(`雨云 API 综合验证 (LIVE=${cfg.mockMode ? 'NO' : 'YES'})`);
  console.log(`API Key: ${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`);
  console.log(`==========================================\n`);

  const results = {};

  // 1. 账号信息 GET /user/
  console.log('--- [1/12] 账号信息 ---');
  const r1 = await callApi(apiKey, 'GET', '/user/');
  results.user = summary('GET /user/', r1, ['username', 'point', 'balance', 'vip_level', 'phone_authed', 'email_authed']);

  // 2. RCS plans GET /product/rcs/plans
  console.log('\n--- [2/12] RCS 套餐列表 ---');
  const r2 = await callApi(apiKey, 'GET', '/product/rcs/plans');
  results.plans = summary('GET /product/rcs/plans', r2, ['id', 'region', 'plan_name', 'machine', 'line', 'price', 'net_mode', 'available_stock', 'is_selling']);

  // 3. RCS OS 模板 GET /product/rcs/os-templates
  console.log('\n--- [3/12] RCS OS 模板 ---');
  const r3 = await callApi(apiKey, 'GET', '/product/rcs/os-templates');
  results.os = summary('GET /product/rcs/os-templates', r3, ['id', 'name', 'os_type', 'is_with_bbr', 'is_available', 'is_eol', 'region']);

  // 4. RCS 价格 GET /product/rcs/price
  console.log('\n--- [4/12] RCS 价格 (plan_id=1234, scene=create) ---');
  const r4 = await callApi(apiKey, 'GET', '/product/rcs/price', { scene: 'create', plan_id: 1234, duration: 1, with_eip_num: 0 });
  results.price = summary('GET /product/rcs/price', r4, ['price', 'detail']);

  // 5. 预装应用 GET /product/fast-install-app
  console.log('\n--- [5/12] 预装应用模板 ---');
  const r5 = await callApi(apiKey, 'GET', '/product/fast-install-app', { product_type: 'rcs' });
  results.apps = summary('GET /product/fast-install-app', r5, ['ID', 'name', 'chinese_name', 'os_requirement', 'order', 'hidden']);

  // 6. panel_users GET /product/panel_users/
  console.log('\n--- [6/12] 面板用户列表 ---');
  const r6 = await callApi(apiKey, 'GET', '/product/panel_users/', null, null);
  // panel_users 需要 options 参数
  const r6b = await callApi(apiKey, 'GET', '/product/panel_users/', {
    options: JSON.stringify({ columnFilters: {}, sort: [], page: 1, perPage: 50 }),
  });
  results.panelUsers = summary('GET /product/panel_users/', r6b, ['name', 'user_id', 'create_date', 'products']);

  // 7. panel_config GET /product/panel_config
  console.log('\n--- [7/12] 面板配置 ---');
  const r7 = await callApi(apiKey, 'GET', '/product/panel_config');
  results.panelConfig = summary('GET /product/panel_config', r7, ['title', 'panel_name', 'domain', 'bg_url']);

  // 8. RCS 列表 GET /product/rcs/
  console.log('\n--- [8/12] RCS 实例列表 ---');
  const r8 = await callApi(apiKey, 'GET', '/product/rcs/', {
    options: JSON.stringify({ columnFilters: {}, sort: [], page: 1, perPage: 50 }),
  });
  results.rcsList = summary('GET /product/rcs/', r8, []);

  // 9. 工单列表 GET /workorder (实测可用路径)
  console.log('\n--- [9/12] 工单列表 ---');
  const r9a = await callApi(apiKey, 'GET', '/workorder');
  const r9b = await callApi(apiKey, 'GET', '/workorder/');
  const r9c = await callApi(apiKey, 'GET', '/workorder', {
    options: JSON.stringify({ columnFilters: {}, sort: [], page: 1, perPage: 10 }),
  });
  results.workorder = summary('GET /workorder', r9a, ['ID', 'Title', 'Type', 'Status']);
  if (r9b.status !== r9a.status || r9b.data?.code !== r9a.data?.code) {
    console.log(`   (对比: /workorder/ → status=${r9b.status}, code=${r9b.data?.code})`);
  }
  if (r9c.data?.code === 200) console.log(`   (带 options 参数: code=200, 数据正常)`);

  // 10. public/products 列表（雨云公共产品分类）
  console.log('\n--- [10/12] 公共产品分类 GET /product ---');
  const r10 = await callApi(apiKey, 'GET', '/product');
  results.productCats = summary('GET /product', r10, []);

  // 11. buy_group（雨云购买分组）
  console.log('\n--- [11/12] 购买分组 GET /product/buy_group ---');
  const r11 = await callApi(apiKey, 'GET', '/product/buy_group');
  results.buyGroup = summary('GET /product/buy_group', r11, []);

  // 12. /public/notice（公告）
  console.log('\n--- [12/12] 公告 GET /public/notice ---');
  const r12 = await callApi(apiKey, 'GET', '/public/notice');
  results.notice = summary('GET /public/notice', r12, []);

  // ===== 统计 =====
  console.log('\n==========================================');
  console.log('验证结果汇总:');
  let okCnt = 0, failCnt = 0;
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${v ? '✅' : '❌'} ${k}`);
    if (v) okCnt++; else failCnt++;
  }
  console.log(`通过: ${okCnt}/${okCnt + failCnt}`);
  console.log('==========================================');

  // ===== 输出关键数据样本 =====
  console.log('\n=== 关键数据样本 ===');

  // plans 样本：取一个 cn-hk1 套餐
  if (results.plans && r2.data?.data) {
    const plans = r2.data.data;
    console.log(`\n[plans] 共 ${plans.length} 个，前 3 个样本:`);
    for (const p of plans.slice(0, 3)) {
      console.log(`  - id=${p.id}, region=${p.region}, plan_name=${p.plan_name}, machine=${p.machine}, line=${p.line || ''}, price=${p.price}, ip_prices=${JSON.stringify(p.ip_prices)}, available_stock=${p.available_stock}, net_mode=${p.net_mode}`);
    }
    // 按 region 统计
    const regionCount = {};
    for (const p of plans) regionCount[p.region] = (regionCount[p.region] || 0) + 1;
    console.log(`\n[plans] 区域分布:`);
    for (const [r, c] of Object.entries(regionCount).sort()) console.log(`  ${r}: ${c} 个`);
  }

  // os 样本
  if (results.os && r3.data?.data) {
    const os = r3.data.data;
    console.log(`\n[os] 共 ${os.length} 个模板:`);
    const byType = {};
    for (const o of os) byType[o.os_type] = (byType[o.os_type] || 0) + 1;
    for (const [t, c] of Object.entries(byType)) console.log(`  ${t}: ${c} 个`);
    console.log(`  样本: ${os.slice(0, 5).map((o) => `${o.id}:${o.name}`).join(', ')}`);
  }

  // apps 样本
  if (results.apps && r5.data?.data) {
    const apps = r5.data?.data || [];
    console.log(`\n[apps] 共 ${apps.length} 个预装应用:`);
    console.log(`  前 10: ${apps.slice(0, 10).map((a) => `${a.ID}:${a.chinese_name || a.name}`).join(', ')}`);
  }

  // panel_users 样本
  if (results.panelUsers && r6b.data?.data) {
    const data = r6b.data.data;
    const records = data?.Records || [];
    console.log(`\n[panel_users] 共 ${data?.TotalRecords ?? records.length} 个:`);
    for (const u of records.slice(0, 5)) {
      console.log(`  - name=${u.name}, user_id=${u.user_id}, products=${u.products?.length || 0} 个`);
    }
  }

  // workorder 样本
  if (results.workorder && r9a.data?.data) {
    const data = r9a.data.data;
    const records = data?.Records || data || [];
    if (Array.isArray(records) && records.length) {
      console.log(`\n[workorder] 共 ${data?.TotalRecords ?? records.length} 张工单:`);
      for (const w of records.slice(0, 5)) {
        console.log(`  - id=${w.ID || w.id}, title=${w.Title || w.title}, status=${w.Status || w.status}`);
      }
    } else {
      console.log(`\n[workorder] 返回结构: ${JSON.stringify(data).slice(0, 300)}`);
    }
  }

  await prisma.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
