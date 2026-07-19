import { IsString, IsNumber, IsBoolean, IsOptional, IsEmail, IsArray, Min, Max, IsEnum } from 'class-validator';

export enum SmtpEncryption {
  NONE = 'NONE',
  SSL = 'SSL',
  STARTTLS = 'STARTTLS',
}

export class UpdateSmtpDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  host: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  port: number;

  @IsEnum(SmtpEncryption)
  encryption: string;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  password?: string; // 不传则保留原密码

  @IsString()
  @IsEmail()
  fromAddress: string;

  @IsString()
  fromName: string;

  @IsOptional()
  @IsString()
  replyTo?: string;

  @IsOptional()
  @IsNumber()
  connectTimeout?: number;

  @IsOptional()
  @IsNumber()
  sendTimeout?: number;

  @IsOptional()
  @IsNumber()
  retryCount?: number;

  @IsOptional()
  @IsNumber()
  dailyLimit?: number;
}

export class TestSendDto {
  @IsString()
  @IsEmail()
  to: string;
}

export class CreateTemplateDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  subject: string;

  @IsString()
  htmlContent: string;

  @IsString()
  textContent: string;

  @IsOptional()
  @IsArray()
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsString()
  textContent?: string;

  @IsOptional()
  @IsArray()
  variables?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class SendMailDto {
  @IsString()
  @IsEmail()
  to: string;

  @IsString()
  subject: string;

  @IsString()
  html: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsNumber()
  userId?: number;
}
