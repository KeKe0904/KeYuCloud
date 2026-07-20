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
  console.log('plan count:', plans.length);
  // 完整打印第一个 plan
  console.log('\n=== 第一个 plan 完整字段 ===');
  console.log(JSON.stringify(plans[0], null, 2));

  // 找一个 cn-wz1 xlarge plan 看完整字段
  const wzXlarge = plans.find((p) => p.region === 'cn-wz1' && p.plan_name === 'xlarge');
  console.log('\n=== cn-wz1 xlarge 完整字段 ===');
  console.log(JSON.stringify(wzXlarge, null, 2));

  // 测试创建 RCS（不实际创建，只看接口报错）
  // 测试调用 /product/rcs/price 看真实参数
  console.log('\n=== 测试 /product/rcs/price ===');
  try {
    const priceRes = await axios.get('https://api.v2.rainyun.com/product/rcs/price', {
      headers: { 'x-api-key': apiKey },
      params: { scene: 'create', plan_id: 0, duration: 1, plan_name: 'xlarge', region: 'cn-wz1', machine: 'G6v2', line: 'single' },
    });
    console.log('price response:', JSON.stringify(priceRes.data, null, 2));
  } catch (e) {
    console.log('price error:', e.response?.status, JSON.stringify(e.response?.data));
  }

  await prisma.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
