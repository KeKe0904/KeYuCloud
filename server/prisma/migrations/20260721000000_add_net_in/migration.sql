-- AlterTable: Product 表新增 netIn 字段（上行带宽，对应雨云 net_in）
-- 为兼容旧数据，允许为 null；syncUpstreamPlans 会自动回填
ALTER TABLE `Product` ADD COLUMN `netIn` INTEGER NULL;
