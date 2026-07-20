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

  // 找 plan_id=1234 和 1241
  const p1234 = plans.find((p) => p.id === 1234);
  const p1241 = plans.find((p) => p.id === 1241);
  console.log('plan_id 1234:', JSON.stringify(p1234, null, 2));
  console.log('\nplan_id 1241:', JSON.stringify(p1241, null, 2));

  // 列出 cn-wz1 xlarge 全部版本（不同 machine/line）
  const wzXlarge = plans.filter((p) => p.region === 'cn-wz1' && p.plan_name === 'xlarge');
  console.log('\ncn-wz1 xlarge 全部版本:');
  wzXlarge.forEach((p) => console.log(`  id=${p.id} machine=${p.machine} line=${p.line} price=${p.price} stock=${p.available_stock} is_selling=${p.is_selling}`));

  // 测试创建 RCS：plan_id=1234, os_id=502（来自订单失败日志），duration=1, zone=cn-wz1
  console.log('\n=== 测试创建 RCS（plan_id=1234, os_id=502, zone=cn-wz1） ===');
  try {
    const createRes = await axios.post('https://api.v2.rainyun.com/product/rcs/', {
      plan_id: 1234,
      os_id: 502,
      duration: 1,
      zone: 'cn-wz1',
    }, { headers: { 'x-api-key': apiKey } });
    console.log('create response:', JSON.stringify(createRes.data, null, 2));
  } catch (e) {
    console.log('create error:', e.response?.status, JSON.stringify(e.response?.data));
  }

  // 测试 plan_id=1234 + 不同 os_id
  console.log('\n=== 测试 /product/rcs/price (plan_id=1234, scene=create) ===');
  try {
    const priceRes = await axios.get('https://api.v2.rainyun.com/product/rcs/price', {
      headers: { 'x-api-key': apiKey },
      params: { scene: 'create', plan_id: 1234, duration: 1, with_eip_num: 0 },
    });
    console.log('price:', JSON.stringify(priceRes.data, null, 2));
  } catch (e) {
    console.log('price error:', e.response?.status, JSON.stringify(e.response?.data));
  }

  await prisma.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
