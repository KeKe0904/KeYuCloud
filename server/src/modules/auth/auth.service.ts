import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';
import { RainyunService } from '../rainyun/rainyun.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto, ChangePasswordDto, UpdateProfileDto } from './dto';
import { NotificationService } from '../notification/notification.service';
import { SmsService } from '../sms/sms.service';
import { MailerService } from '../mailer/mailer.service';
import { sanitizeText } from '../../common/sanitize.util';

@Injectable()
export class AuthService {
  private logger = new Logger('Auth');

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private rainyun: RainyunService,
    private notification: NotificationService,
    private sms: SmsService,
    private mailer: MailerService,
  ) {}

  async register(dto: RegisterDto, ip?: string) {
    // SMTP 开启时强制要求邮箱绑定；未开启时邮箱可选
    const smtpEnabled = await this.mailer.isSmtpEnabled();
    if (smtpEnabled && !dto.email) {
      throw new BadRequestException('系统已开启邮件服务，请填写邮箱地址');
    }
    // 校验邮箱唯一性（若传了邮箱）
    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new ConflictException('邮箱已被注册');
    }

    // 校验短信验证码（阿里云号码认证服务）
    const passed = await this.sms.checkVerifyCode(dto.phone, dto.smsCode);
    if (!passed) {
      throw new BadRequestException('短信验证码错误或已失效');
    }

    // 校验手机号是否已注册
    const exists = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (exists) throw new ConflictException('手机号已注册');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    // XSS 清洗昵称（限 30 字符）
    const safeNickname = dto.nickname
      ? sanitizeText(dto.nickname, 30)
      : `用户${dto.phone.slice(-4)}`;
    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        email: dto.email || null,
        nickname: safeNickname,
        passwordHash,
        invitedBy: dto.inviteCode ? await this.resolveInviter(dto.inviteCode) : null,
      },
    });

    // 同步创建 panel_user
    // 注意：雨云 API 不允许 name 包含下划线等特殊字符，仅允许字母数字（3-16 字符）
    const panelName = `pu${user.id}`;
    // 面板密码与注册密码保持一致（与 changePassword 行为对齐）
    // 用户在平台修改密码时也会同步到面板，因此注册阶段也用同一密码
    const panelPassword = dto.password;
    try {
      await this.rainyun.createPanelUser(panelName, panelPassword, `user_${user.id}`);
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          panelUserName: panelName,
          panelUserStatus: 'CREATED',
          panelUserSyncedAt: new Date(),
        },
      });
      // 通过站内通知告知用户面板账号信息
      await this.notification.send(user.id, {
        type: 'system',
        title: '云服务器面板账号已创建',
        content: `您的云服务器面板账号已创建：\n面板用户名：${panelName}\n面板密码：与您注册时设置的登录密码一致\n\n您可使用面板用户名和登录密码登录雨云官方面板管理服务器。如需修改密码，请在平台「账号设置」中修改，修改后会自动同步到面板。`,
        link: '/user-products',
      }).catch(() => {/* 通知失败不影响注册 */});
      this.logger.log(`用户 ${user.id} panel_user 创建成功: ${panelName}`);
    } catch (err: any) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { panelUserStatus: 'FAILED' },
      });
      this.logger.error(`用户 ${user.id} panel_user 创建失败: ${err.message}`);
      // 失败不阻塞注册，后续可补偿
    }

    // 邀请人计数
    if (user.invitedBy) {
      await this.prisma.user.update({
        where: { id: user.invitedBy },
        data: { inviteCount: { increment: 1 } },
      });
    }

    // 欢迎通知
    await this.notification.send(user.id, {
      type: 'system',
      title: '欢迎注册',
      content: `欢迎来到云服分销平台！您的账号已创建成功。`,
    });

    const token = await this.signToken(user);
    return {
      token,
      user: this.sanitizeUser(user),
    };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    if (user.status === 'BANNED') throw new UnauthorizedException('账号已被封禁');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });

    const token = await this.signToken(user);
    return { token, user: this.sanitizeUser(user) };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    const ok = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('原密码错误');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // 同步到 panel_user
    if (user.panelUserName) {
      try {
        await this.rainyun.updatePanelUserPassword(user.panelUserName, dto.newPassword, `user_${userId}`);
      } catch (err: any) {
        this.logger.error(`同步 panel_user 密码失败: ${err.message}`);
      }
    }

    await this.notification.send(userId, {
      type: 'system',
      title: '密码已修改',
      content: '您的账号密码已修改，如非本人操作请立即联系客服。',
    });

    return { success: true };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    // XSS 清洗用户输入
    const data: any = {};
    if (dto.nickname !== undefined) {
      data.nickname = sanitizeText(dto.nickname, 30);
    }
    if (dto.email !== undefined) {
      const newEmail = dto.email?.trim() || null;
      // 邮箱唯一性校验：与现有其他用户冲突时报错
      if (newEmail) {
        const conflict = await this.prisma.user.findUnique({ where: { email: newEmail } });
        if (conflict && conflict.id !== userId) {
          throw new ConflictException('邮箱已被其他账号使用');
        }
      }
      // SMTP 开启时不允许清空邮箱
      if (!newEmail) {
        const smtpEnabled = await this.mailer.isSmtpEnabled();
        if (smtpEnabled) {
          throw new BadRequestException('系统已开启邮件服务，邮箱不能为空');
        }
      }
      data.email = newEmail;
    }
    if (dto.avatar !== undefined) data.avatar = dto.avatar?.trim() || null;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    return this.sanitizeUser(user);
  }

  async getProfile(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return this.sanitizeUser(user);
  }

  private async resolveInviter(inviteCode: string): Promise<number | null> {
    const inviter = await this.prisma.user.findUnique({ where: { inviteCode } });
    return inviter?.id || null;
  }

  private async signToken(user: any) {
    return this.jwt.sign({
      sub: user.id,
      phone: user.phone,
    });
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      nickname: user.nickname,
      avatar: user.avatar,
      balance: user.balance,
      status: user.status,
      isRealname: user.isRealname,
      inviteCode: user.inviteCode,
      panelUserName: user.panelUserName,
      panelUserStatus: user.panelUserStatus,
      createdAt: user.createdAt,
    };
  }
}
