const axios = require('axios');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const secret = process.env.AES_SECRET;
const key = crypto.createHash('sha256').update(secret).digest();
function decrypt(encrypted) {
  const [ivHex, dataHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

(async () => {
  const cfg = await prisma.rainyunConfig.findUnique({ where: { id: 1 } });
  const apiKey = decrypt(cfg.apiKeyEnc);

  const res = await axios.get('https://api.v2.rainyun.com/product/rcs/plans', {
    headers: { 'x-api-key': apiKey },
  });
  const plans = res.data.data || [];

  // 构造雨云 plan 索引：region+plan_name+machine+line -> id
  const planIndex = new Map();
  for (const p of plans) {
    const k = `${p.region}|${p.plan_name}|${p.machine}|${p.line || ''}`;
    planIndex.set(k, p);
  }

  const products = await prisma.product.findMany({
    orderBy: { id: 'asc' },
  });

  let matched = 0, mismatched = 0, total = 0;
  console.log('Product ID | upstreamPlanId | zone | name | machine | line | 雨云实际匹配');
  console.log('---');
  for (const p of products) {
    total++;
    const upstreamPlan = plans.find((rp) => rp.id === p.upstreamPlanId);
    if (upstreamPlan) {
      // 验证 zone 和 name 是否匹配
      const zoneOk = upstreamPlan.region === p.zone;
      const nameOk = upstreamPlan.plan_name === p.name;
      if (zoneOk && nameOk) {
        matched++;
      } else {
        mismatched++;
        console.log(`#${p.id} | ${p.upstreamPlanId} | ${p.zone}/${p.name} | 雨云: ${upstreamPlan.region}/${upstreamPlan.plan_name}/${upstreamPlan.machine} | 不匹配(zone/name)`);
      }
    } else {
      mismatched++;
      // 反查：根据 zone+name 找正确 plan_id
      const correctPlan = plans.find((rp) => rp.region === p.zone && rp.plan_name === p.name && rp.is_selling);
      console.log(`#${p.id} | ${p.upstreamPlanId} | ${p.zone}/${p.name} | 雨云未找到此 plan_id | 正确 plan_id: ${correctPlan ? correctPlan.id + ' (machine=' + correctPlan.machine + ', line=' + (correctPlan.line||'') + ')' : '仍无匹配'}`);
    }
  }
  console.log(`\n总计: ${total} 个商品, 匹配 ${matched}, 不匹配 ${mismatched}`);

  // 检查测试创建 RCS 接口是否真的需要 plan_id
  console.log('\n=== 测试 /product/rcs/price 用 plan_id=1223 (cn-wz1 xlarge) ===');
  try {
    const priceRes = await axios.get('https://api.v2.rainyun.com/product/rcs/price', {
      headers: { 'x-api-key': apiKey },
      params: { scene: 'create', plan_id: 1223, duration: 1 },
    });
    console.log('price:', JSON.stringify(priceRes.data, null, 2));
  } catch (e) {
    console.log('price error:', e.response?.status, JSON.stringify(e.response?.data));
  }

  await prisma.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
