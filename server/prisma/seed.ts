/**
 * Prisma Seed - 初始化管理员和系统配置
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始 seed...');

  // 1. 创建初始管理员
  const adminUsername = process.env.INIT_ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.INIT_ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await prisma.admin.findUnique({ where: { username: adminUsername } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await prisma.admin.create({
      data: {
        username: adminUsername,
        passwordHash: hash,
        nickname: '超级管理员',
        role: 'SUPER_ADMIN',
        email: 'admin@localhost',
      },
    });
    console.log(`✅ 创建初始管理员: ${adminUsername} / ${adminPassword}`);
  } else {
    console.log(`ℹ️ 管理员已存在: ${adminUsername}`);
  }

  // 2. 系统配置默认值
  const defaultConfigs = [
    { key: 'icp', value: '', type: 'string', description: 'ICP 备案号' },
    { key: 'company_name', value: '云服分销平台', type: 'string', description: '公司名称' },
    { key: 'contact_email', value: 'support@localhost', type: 'string', description: '联系邮箱' },
    { key: 'contact_qq', value: '', type: 'string', description: '联系 QQ' },
    { key: 'tos_url', value: '', type: 'string', description: '服务条款链接' },
    { key: 'privacy_url', value: '', type: 'string', description: '隐私政策链接' },
    { key: 'default_markup_rate', value: '0.15', type: 'string', description: '默认加价率' },
    { key: 'open_timeout', value: '300', type: 'string', description: '开通超时阈值（秒）' },
    { key: 'sync_interval', value: '3600', type: 'string', description: '上游同步间隔（秒）' },
  ];
  for (const cfg of defaultConfigs) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: cfg.key } });
    if (!existing) {
      await prisma.systemConfig.create({ data: cfg });
      console.log(`  + 配置: ${cfg.key}`);
    }
  }

  // 3. 默认公告
  const existingAnn = await prisma.announcement.findFirst({ where: { title: '欢迎使用云服分销平台' } });
  if (!existingAnn) {
    await prisma.announcement.create({
      data: {
        title: '欢迎使用云服分销平台',
        content: '我们提供高性能云服务器，基于雨云上游资源，性价比卓越。新用户注册即享优惠！',
        position: 'portal',
        pinned: true,
        status: 'ACTIVE',
      },
    });
    console.log('✅ 创建默认公告');
  }

  console.log('🎉 Seed 完成');
}

main()
  .catch((e) => {
    console.error('❌ Seed 失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
