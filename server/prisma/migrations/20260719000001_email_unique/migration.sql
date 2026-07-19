-- 为 User 和 Admin 的 email 字段添加唯一索引
-- 注意：若已有重复 email 数据，需要先清理冲突再执行
CREATE UNIQUE INDEX `Admin_email_key` ON `Admin`(`email`);
CREATE UNIQUE INDEX `User_email_key` ON `User`(`email`);
