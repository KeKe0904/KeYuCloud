-- 为 User 表新增 uid（六位数用户ID）和 username（登录用户名）字段
-- uid：从 100001 起递增，用户可见的唯一标识
-- username：登录用户名（英文+数字或纯数字），同步作为雨云面板用户名

-- 1. 新增字段（username 可空，兼容存量用户；uid 先可空，后续回填）
ALTER TABLE `User` ADD COLUMN `uid` INT NULL;
ALTER TABLE `User` ADD COLUMN `username` VARCHAR(191) NULL;

-- 2. 为存量用户回填 uid（从 100001 开始按 id 递增分配）
-- 使用用户变量实现连续递增
SET @uid_base = 100000;
UPDATE `User` SET `uid` = (@uid_base := @uid_base + 1) ORDER BY `id` ASC;

-- 3. 为存量用户回填 username（使用 pu{id} 格式，保证唯一且符合字母数字规则）
UPDATE `User` SET `username` = CONCAT('pu', `id`) WHERE `username` IS NULL;

-- 4. 同步更新 panelUserName 为 username（若 panelUserName 为空或为旧 pu{id} 格式）
-- 仅更新 panelUserName 为空的记录，避免覆盖已正确同步的
UPDATE `User` SET `panelUserName` = `username` WHERE `panelUserName` IS NULL;

-- 5. 添加唯一索引（此时所有记录都已有值，不会冲突）
CREATE UNIQUE INDEX `User_uid_key` ON `User`(`uid`);
CREATE UNIQUE INDEX `User_username_key` ON `User`(`username`);
