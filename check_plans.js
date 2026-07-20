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
  console.log('apiKey prefix:', apiKey.slice(0, 6) + '***' + apiKey.slice(-4));

  const res = await axios.get('https://api.v2.rainyun.com/product/rcs/plans', {
    headers: { 'x-api-key': apiKey },
  });
  const plans = res.data.data || [];
  console.log('plan count:', plans.length);

  const found1 = plans.find((p) => p.ID === 1234);
  const found2 = plans.find((p) => p.ID === 1241);
  console.log('plan_id 1234 exists:', found1 ? JSON.stringify({ name: found1.plan_name, region: found1.region }) : 'NO');
  console.log('plan_id 1241 exists:', found2 ? JSON.stringify({ name: found2.plan_name, region: found2.region }) : 'NO');

  const wz = plans.filter((p) => p.region === 'cn-wz1').slice(0, 8);
  const hk = plans.filter((p) => p.region === 'cn-hk1').slice(0, 8);
  console.log('\ncn-wz1 plans (first 8):');
  wz.forEach((p) => console.log(`  ID=${p.ID} name=${p.plan_name} machine=${p.machine} line=${p.line} price=${p.price} stock=${p.available_stock} is_selling=${p.is_selling}`));
  console.log('\ncn-hk1 plans (first 8):');
  hk.forEach((p) => console.log(`  ID=${p.ID} name=${p.plan_name} machine=${p.machine} line=${p.line} price=${p.price} stock=${p.available_stock} is_selling=${p.is_selling}`));

  const products = await prisma.product.findMany({
    select: { id: true, name: true, upstreamPlanId: true, zone: true, zoneName: true, isOnSale: true, availableStock: true },
    take: 20,
    orderBy: { id: 'asc' },
  });
  console.log('\nDatabase products (first 20):');
  products.forEach((p) => {
    const matched = plans.find((rp) => rp.ID === p.upstreamPlanId);
    console.log(`  Product #${p.id} upstreamPlanId=${p.upstreamPlanId} zone=${p.zone} name=${p.name} | 雨云匹配: ${matched ? matched.plan_name + ' (region=' + matched.region + ')' : '未找到'}`);
  });

  await prisma.$disconnect();
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
