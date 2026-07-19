-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `phone` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `avatar` VARCHAR(191) NULL,
    `balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `vipLevel` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `isRealname` BOOLEAN NOT NULL DEFAULT false,
    `realnameInfo` VARCHAR(191) NULL,
    `inviteCode` VARCHAR(191) NOT NULL,
    `invitedBy` INTEGER NULL,
    `inviteCount` INTEGER NOT NULL DEFAULT 0,
    `panelUserName` VARCHAR(191) NULL,
    `panelUserStatus` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `panelUserSyncedAt` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_phone_key`(`phone`),
    UNIQUE INDEX `User_inviteCode_key`(`inviteCode`),
    UNIQUE INDEX `User_panelUserName_key`(`panelUserName`),
    INDEX `User_phone_idx`(`phone`),
    INDEX `User_invitedBy_idx`(`invitedBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Admin` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(191) NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'OPERATOR',
    `permissions` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `email` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIp` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Admin_username_key`(`username`),
    INDEX `Admin_username_idx`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `upstreamPlanId` INTEGER NOT NULL,
    `upstreamPlanName` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT 'RCS',
    `zone` VARCHAR(191) NULL,
    `zoneName` VARCHAR(191) NULL,
    `cpu` INTEGER NULL,
    `memory` INTEGER NULL,
    `disk` INTEGER NULL,
    `bandwidth` INTEGER NULL,
    `traffic` INTEGER NULL,
    `upstreamPrices` VARCHAR(191) NULL,
    `markupRate` DECIMAL(4, 3) NOT NULL DEFAULT 0.15,
    `prices` VARCHAR(191) NULL,
    `group` VARCHAR(191) NULL,
    `tags` VARCHAR(191) NULL,
    `sortWeight` INTEGER NOT NULL DEFAULT 0,
    `isRecommended` BOOLEAN NOT NULL DEFAULT false,
    `isOnSale` BOOLEAN NOT NULL DEFAULT true,
    `perUserLimit` INTEGER NOT NULL DEFAULT 0,
    `salesCount` INTEGER NOT NULL DEFAULT 0,
    `upstreamChanged` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_category_isOnSale_idx`(`category`, `isOnSale`),
    INDEX `Product_zone_idx`(`zone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderNo` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `duration` INTEGER NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `upstreamCost` DECIMAL(10, 2) NOT NULL,
    `couponId` INTEGER NULL,
    `couponDiscount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `payMethod` VARCHAR(191) NULL,
    `payTradeNo` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `payTime` DATETIME(3) NULL,
    `openTime` DATETIME(3) NULL,
    `openResult` TEXT NULL,
    `userProductId` INTEGER NULL,
    `upstreamRcsId` INTEGER NULL,
    `upstreamTaskId` INTEGER NULL,
    `remark` VARCHAR(191) NULL,
    `isRisky` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_orderNo_key`(`orderNo`),
    INDEX `Order_userId_status_idx`(`userId`, `status`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Order_orderNo_idx`(`orderNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserProduct` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `orderId` INTEGER NOT NULL,
    `upstreamRcsId` INTEGER NOT NULL,
    `upstreamRcsName` VARCHAR(191) NULL,
    `panelUserName` VARCHAR(191) NULL,
    `state` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `stateSyncedAt` DATETIME(3) NULL,
    `expireAt` DATETIME(3) NOT NULL,
    `autoRenew` BOOLEAN NOT NULL DEFAULT false,
    `zone` VARCHAR(191) NULL,
    `zoneName` VARCHAR(191) NULL,
    `osId` INTEGER NULL,
    `osName` VARCHAR(191) NULL,
    `cpu` INTEGER NULL,
    `memory` INTEGER NULL,
    `disk` INTEGER NULL,
    `bandwidth` INTEGER NULL,
    `ipv4` VARCHAR(191) NULL,
    `ipv6` VARCHAR(191) NULL,
    `natIps` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserProduct_orderId_key`(`orderId`),
    INDEX `UserProduct_userId_state_idx`(`userId`, `state`),
    INDEX `UserProduct_expireAt_idx`(`expireAt`),
    INDEX `UserProduct_upstreamRcsId_idx`(`upstreamRcsId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ticket` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketNo` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `userProductId` INTEGER NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `assignedAdminId` INTEGER NULL,
    `rainyunWorkorderId` INTEGER NULL,
    `rainyunSyncedAt` DATETIME(3) NULL,
    `rainyunIsAuthed` BOOLEAN NOT NULL DEFAULT true,
    `rating` INTEGER NULL,
    `ratingComment` VARCHAR(191) NULL,
    `firstResponseAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Ticket_ticketNo_key`(`ticketNo`),
    INDEX `Ticket_userId_status_idx`(`userId`, `status`),
    INDEX `Ticket_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Ticket_assignedAdminId_idx`(`assignedAdminId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TicketMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ticketId` INTEGER NOT NULL,
    `fromType` VARCHAR(191) NOT NULL,
    `fromId` INTEGER NULL,
    `fromName` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `rainyunMsgId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TicketMessage_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    UNIQUE INDEX `TicketMessage_ticketId_rainyunMsgId_key`(`ticketId`, `rainyunMsgId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BalanceTransaction` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `balanceAfter` DECIMAL(10, 2) NOT NULL,
    `orderId` INTEGER NULL,
    `ticketId` INTEGER NULL,
    `adminId` INTEGER NULL,
    `remark` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BalanceTransaction_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `BalanceTransaction_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL,
    `minAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `applicableCategory` VARCHAR(191) NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validTo` DATETIME(3) NULL,
    `totalQty` INTEGER NOT NULL DEFAULT -1,
    `issuedQty` INTEGER NOT NULL DEFAULT 0,
    `usedQty` INTEGER NOT NULL DEFAULT 0,
    `perUserLimit` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Coupon_code_key`(`code`),
    INDEX `Coupon_status_validFrom_idx`(`status`, `validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCoupon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `couponId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'UNUSED',
    `orderId` INTEGER NULL,
    `obtainedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserCoupon_orderId_key`(`orderId`),
    INDEX `UserCoupon_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `UserCoupon_userId_couponId_key`(`userId`, `couponId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `link` VARCHAR(191) NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_userId_isRead_createdAt_idx`(`userId`, `isRead`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SmtpConfig` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `host` VARCHAR(191) NOT NULL DEFAULT '',
    `port` INTEGER NOT NULL DEFAULT 465,
    `encryption` VARCHAR(191) NOT NULL DEFAULT 'SSL',
    `username` VARCHAR(191) NOT NULL DEFAULT '',
    `passwordEnc` VARCHAR(191) NOT NULL DEFAULT '',
    `fromAddress` VARCHAR(191) NOT NULL DEFAULT '',
    `fromName` VARCHAR(191) NOT NULL DEFAULT '',
    `replyTo` VARCHAR(191) NULL,
    `connectTimeout` INTEGER NOT NULL DEFAULT 10,
    `sendTimeout` INTEGER NOT NULL DEFAULT 30,
    `retryCount` INTEGER NOT NULL DEFAULT 3,
    `dailyLimit` INTEGER NOT NULL DEFAULT 1000,
    `todaySent` INTEGER NOT NULL DEFAULT 0,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestResult` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailTemplate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `htmlContent` TEXT NOT NULL,
    `textContent` TEXT NOT NULL,
    `variables` VARCHAR(191) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EmailTemplate_code_key`(`code`),
    INDEX `EmailTemplate_enabled_idx`(`enabled`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `toAddress` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `templateCode` VARCHAR(191) NULL,
    `userId` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `errorMessage` VARCHAR(191) NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `sentAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailLog_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `EmailLog_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminId` INTEGER NOT NULL,
    `module` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NULL,
    `targetId` INTEGER NULL,
    `oldValue` TEXT NULL,
    `newValue` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_adminId_createdAt_idx`(`adminId`, `createdAt`),
    INDEX `AdminAuditLog_module_action_createdAt_idx`(`module`, `action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'string',
    `description` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SystemConfig_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `position` VARCHAR(191) NOT NULL DEFAULT 'portal',
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validTo` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Announcement_position_status_validFrom_idx`(`position`, `status`, `validFrom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UpstreamApiLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `method` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `requestBody` TEXT NULL,
    `statusCode` INTEGER NULL,
    `responseBody` TEXT NULL,
    `durationMs` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `triggeredBy` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UpstreamApiLog_category_createdAt_idx`(`category`, `createdAt`),
    INDEX `UpstreamApiLog_statusCode_createdAt_idx`(`statusCode`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProduct` ADD CONSTRAINT `UserProduct_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProduct` ADD CONSTRAINT `UserProduct_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserProduct` ADD CONSTRAINT `UserProduct_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_userProductId_fkey` FOREIGN KEY (`userProductId`) REFERENCES `UserProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ticket` ADD CONSTRAINT `Ticket_assignedAdminId_fkey` FOREIGN KEY (`assignedAdminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TicketMessage` ADD CONSTRAINT `TicketMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `Ticket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BalanceTransaction` ADD CONSTRAINT `BalanceTransaction_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCoupon` ADD CONSTRAINT `UserCoupon_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCoupon` ADD CONSTRAINT `UserCoupon_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCoupon` ADD CONSTRAINT `UserCoupon_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SmtpConfig` ADD CONSTRAINT `SmtpConfig_updatedBy_fkey` FOREIGN KEY (`updatedBy`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAuditLog` ADD CONSTRAINT `AdminAuditLog_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
