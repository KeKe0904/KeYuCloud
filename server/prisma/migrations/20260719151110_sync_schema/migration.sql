-- DropForeignKey
ALTER TABLE `Order` DROP FOREIGN KEY `Order_productId_fkey`;

-- DropForeignKey
ALTER TABLE `UserProduct` DROP FOREIGN KEY `UserProduct_orderId_fkey`;

-- AlterTable
ALTER TABLE `Admin` ADD COLUMN `avatarUrl` TEXT NULL,
    ADD COLUMN `qq` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Order` ADD COLUMN `diskSize` INTEGER NULL,
    ADD COLUMN `diskType` VARCHAR(191) NULL,
    ADD COLUMN `diskUnitPrice` DECIMAL(10, 2) NULL,
    ADD COLUMN `ipCount` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `ipType` VARCHAR(191) NULL DEFAULT '',
    ADD COLUMN `ipUnitPrice` DECIMAL(10, 2) NULL,
    ADD COLUMN `machineUnitPrice` DECIMAL(10, 2) NULL,
    ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'PRODUCT',
    MODIFY `productId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Product` ADD COLUMN `availableStock` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `chargeType` VARCHAR(191) NULL,
    ADD COLUMN `defaultIpType` VARCHAR(191) NULL DEFAULT '',
    ADD COLUMN `ipPrices` TEXT NULL,
    ADD COLUMN `line` VARCHAR(191) NULL,
    ADD COLUMN `machine` VARCHAR(191) NULL,
    ADD COLUMN `netMode` VARCHAR(191) NOT NULL DEFAULT 'normal',
    ADD COLUMN `trafficType` VARCHAR(191) NULL DEFAULT 'unlimited',
    ADD COLUMN `upstreamDiskPrices` TEXT NULL,
    ADD COLUMN `upstreamDiskSelling` TEXT NULL,
    ADD COLUMN `upstreamDiskSizes` TEXT NULL,
    ADD COLUMN `upstreamIpPrices` TEXT NULL,
    ADD COLUMN `upstreamIpSelling` TEXT NULL,
    MODIFY `markupRate` DECIMAL(4, 3) NOT NULL DEFAULT -0.10;

-- AlterTable
ALTER TABLE `Ticket` ADD COLUMN `source` VARCHAR(191) NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE `UserProduct` MODIFY `orderId` INTEGER NULL;

-- CreateTable
CREATE TABLE `RainyunConfig` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `apiKeyEnc` VARCHAR(191) NOT NULL DEFAULT '',
    `apiBase` VARCHAR(191) NOT NULL DEFAULT 'https://api.v2.rainyun.com',
    `mockMode` BOOLEAN NOT NULL DEFAULT false,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestResult` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmsConfig` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `accessKeyId` VARCHAR(191) NOT NULL DEFAULT '',
    `accessKeySecretEnc` VARCHAR(191) NOT NULL DEFAULT '',
    `signName` VARCHAR(191) NOT NULL DEFAULT '',
    `templateCode` VARCHAR(191) NOT NULL DEFAULT '100001',
    `schemeName` VARCHAR(191) NULL,
    `codeLength` INTEGER NOT NULL DEFAULT 6,
    `codeType` INTEGER NOT NULL DEFAULT 1,
    `validTime` INTEGER NOT NULL DEFAULT 300,
    `interval` INTEGER NOT NULL DEFAULT 60,
    `duplicatePolicy` INTEGER NOT NULL DEFAULT 1,
    `dailyLimit` INTEGER NOT NULL DEFAULT 1000,
    `todaySent` INTEGER NOT NULL DEFAULT 0,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestResult` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmsLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phoneNumber` VARCHAR(191) NOT NULL,
    `scene` VARCHAR(191) NOT NULL,
    `bizId` VARCHAR(191) NULL,
    `outId` VARCHAR(191) NULL,
    `verifyCode` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorCode` VARCHAR(64) NULL,
    `errorMessage` TEXT NULL,
    `durationMs` INTEGER NULL,
    `userId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SmsLog_phoneNumber_createdAt_idx`(`phoneNumber`, `createdAt`),
    INDEX `SmsLog_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `SmsLog_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProduct` ADD CONSTRAINT `UserProduct_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RainyunConfig` ADD CONSTRAINT `RainyunConfig_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmsConfig` ADD CONSTRAINT `SmsConfig_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
