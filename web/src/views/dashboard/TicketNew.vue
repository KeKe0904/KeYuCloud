<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ticketApi } from '@/api/ticket';
import { userProductApi } from '@/api/user-product';

const route = useRoute();
const router = useRouter();

// 表单引用
const formRef = ref<FormInstance>();
// 提交中状态
const submitting = ref(false);
// 我的产品列表（用于关联产品下拉）
const productList = ref<any[]>([]);

// 工单来源：local=本站工单 / official=官方工单（直接调雨云 API）
// 默认本站工单：用户无需关联机器即可提问
const source = ref<'local' | 'official'>('local');

// 表单数据
const form = reactive({
  type: '' as string,
  title: '' as string,
  content: '' as string,
  userProductId: '' as number | '',
});

// 官方工单必须关联雨云产品
const isOfficial = computed(() => source.value === 'official');

// 校验规则
const rules = computed<FormRules>(() => ({
  type: [{ required: true, message: '请选择工单类型', trigger: 'change' }],
  title: [
    { required: true, message: '请输入工单标题', trigger: 'blur' },
    { min: 4, max: 80, message: '标题长度为 4-80 个字符', trigger: 'blur' },
  ],
  content: [
    { required: true, message: '请输入工单内容', trigger: 'blur' },
    { min: 10, max: 2000, message: '内容长度为 10-2000 个字符', trigger: 'blur' },
  ],
  userProductId: isOfficial.value
    ? [{ required: true, message: '官方工单必须关联已购买的服务器', trigger: 'change' }]
    : [],
}));

// 类型选项（与后端 DTO @IsIn 对齐：tech/expense/sale/feedback/reward）
const typeOptions = [
  { label: '售前咨询', value: 'sale' },
  { label: '财务问题', value: 'expense' },
  { label: '技术支持', value: 'tech' },
  { label: '奖励返佣', value: 'reward' },
  { label: '意见反馈', value: 'feedback' },
];

// 加载产品列表
async function loadProducts() {
  try {
    const res = await userProductApi.list({ page: 1, pageSize: 100 });
    productList.value = res.data?.list || res.data?.items || [];
  } catch (e) {
    // 忽略加载失败
  }
}

// 切换为官方工单时，若无关联产品则提示
function onSourceChange(val: 'local' | 'official') {
  if (val === 'official' && productList.value.length === 0) {
    ElMessage.warning('您当前没有已购买的服务器，官方工单需要关联服务器。可先选择本站工单提问。');
  }
  // 切换时清空表单验证状态
  formRef.value?.clearValidate();
}

// 提交工单
async function onSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }
  submitting.value = true;
  try {
    const res = await ticketApi.create({
      type: form.type,
      title: form.title,
      content: form.content,
      userProductId: form.userProductId ? Number(form.userProductId) : undefined,
      source: source.value,
    } as any);
    ElMessage.success(isOfficial.value ? '官方工单已提交至雨云' : '工单提交成功');
    const newId = res.data?.id || res.data?.ticketId;
    if (newId) {
      router.push(`/dashboard/tickets/${newId}`);
    } else {
      router.push('/dashboard/tickets');
    }
  } catch (e) {
    // 错误已由拦截器统一提示
  } finally {
    submitting.value = false;
  }
}

// 取消
function onCancel() {
  router.back();
}

onMounted(() => {
  loadProducts();
  // 若携带了 productId 参数则自动选中
  const pid = route.query.productId;
  if (pid) {
    form.userProductId = Number(pid);
  }
});
</script>

<template>
  <div class="ticket-new-page">
    <!-- 页头 -->
    <header class="page-head">
      <el-button link class="back-btn" @click="onCancel">
        <el-icon><ArrowLeft /></el-icon>
        返回
      </el-button>
      <div class="head-meta">
        <span class="eyebrow">NEW TICKET</span>
        <h1 class="page-title font-display">提交工单</h1>
      </div>
    </header>

    <!-- 表单卡 -->
    <section class="form-card card">
      <div class="card-header">
        <h2 class="card-title">工单信息</h2>
      </div>
      <div class="card-body">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="100px"
          label-position="right"
          size="default"
        >
          <!-- 工单来源选择（新增） -->
          <el-form-item label="工单来源" prop="source">
            <div class="source-radio-group">
              <label
                class="source-radio-card"
                :class="{ active: source === 'local' }"
              >
                <input
                  type="radio"
                  v-model="source"
                  value="local"
                  @change="onSourceChange('local')"
                  hidden
                />
                <div class="source-card-inner">
                  <div class="source-card-head">
                    <el-icon class="source-icon"><ChatLineSquare /></el-icon>
                    <span class="source-name">本站工单</span>
                    <span v-if="source === 'local'" class="source-check">
                      <el-icon><Check /></el-icon>
                    </span>
                  </div>
                  <p class="source-desc">由本站客服处理，响应更快。无需关联机器即可提问。</p>
                </div>
              </label>
              <label
                class="source-radio-card"
                :class="{ active: source === 'official' }"
              >
                <input
                  type="radio"
                  v-model="source"
                  value="official"
                  @change="onSourceChange('official')"
                  hidden
                />
                <div class="source-card-inner">
                  <div class="source-card-head">
                    <el-icon class="source-icon"><Connection /></el-icon>
                    <span class="source-name">官方工单</span>
                    <span v-if="source === 'official'" class="source-check">
                      <el-icon><Check /></el-icon>
                    </span>
                  </div>
                  <p class="source-desc">直接接入雨云官方平台处理。需关联已购买的服务器。</p>
                </div>
              </label>
            </div>
          </el-form-item>

          <el-form-item label="工单类型" prop="type">
            <el-select v-model="form.type" placeholder="请选择工单类型" style="width: 100%; max-width: 320px">
              <el-option v-for="opt in typeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </el-form-item>

          <el-form-item label="工单标题" prop="title">
            <el-input
              v-model="form.title"
              placeholder="请用一句话描述您的问题"
              maxlength="80"
              show-word-limit
              style="max-width: 600px"
            />
          </el-form-item>

          <el-form-item label="关联产品" prop="userProductId">
            <el-select
              v-model="form.userProductId"
              :placeholder="isOfficial ? '官方工单必须选择关联产品' : '可选，选择需要关联的产品'"
              clearable
              filterable
              style="width: 100%; max-width: 480px"
            >
              <el-option
                v-for="item in productList"
                :key="item.id"
                :label="`${item.name || item.productName || '未命名产品'} (#${item.id})`"
                :value="item.id"
              />
            </el-select>
            <div v-if="isOfficial" class="form-tip form-tip-warning">
              官方工单将直接通过雨云官方 API 提交，必须关联您已购买的服务器。
            </div>
          </el-form-item>

          <el-form-item label="工单内容" prop="content">
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="8"
              placeholder="请详细描述您遇到的问题，包括：现象、复现步骤、期望结果等"
              maxlength="2000"
              show-word-limit
              style="max-width: 720px"
            />
          </el-form-item>

          <el-form-item>
            <el-button class="btn-gold" :loading="submitting" @click="onSubmit">
              <el-icon><Promotion /></el-icon>
              {{ isOfficial ? '提交至雨云官方' : '提交工单' }}
            </el-button>
            <el-button class="btn-outline" @click="onCancel">取消</el-button>
          </el-form-item>
        </el-form>
      </div>
    </section>

    <!-- 提示 -->
    <section class="tip-card card">
      <div class="tip-icon">
        <el-icon><InfoFilled /></el-icon>
      </div>
      <div class="tip-content">
        <div class="tip-title eyebrow">提交须知</div>
        <ul class="tip-list">
          <li><strong>本站工单</strong>：由本站客服处理，无需关联机器，适合一般咨询。</li>
          <li><strong>官方工单</strong>：直接接入雨云官方平台，必须关联已购买的服务器。</li>
          <li>本站工单后续可升级为官方工单（不可降级）。</li>
          <li>若涉及敏感信息（如密码、身份证号等），请勿在工单中明文发送。</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/responsive.scss' as *;

.ticket-new-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 960px;
  overflow-x: hidden;
}

// ============ 页头 ============
.page-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.back-btn {
  color: var(--text-tertiary);
  padding: 0;
  font-size: 13px;
  align-self: flex-start;

  &:hover {
    color: var(--text-gold);
  }
}

.head-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .eyebrow {
    display: block;
  }
}

.page-title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.15;
  letter-spacing: -0.3px;
}

// ============ 表单卡 ============
.form-card {
  overflow: hidden;
  min-width: 0;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-base);
}

.card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  padding: 24px 20px;
}

// ============ 工单来源选择卡 ============
.source-radio-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 640px;
}

.source-radio-card {
  cursor: pointer;
  border: 1.5px solid var(--border-base);
  border-radius: 10px;
  background: var(--bg-elevated);
  transition: all 0.2s ease;
  display: block;
  min-width: 0;

  &:hover {
    border-color: var(--gold-300);
    background: var(--bg-subtle);
  }

  &.active {
    border-color: var(--gold-400);
    background: rgba(var(--gold-400-rgb, 234, 179, 8), 0.06);
    box-shadow: 0 0 0 3px rgba(var(--gold-400-rgb, 234, 179, 8), 0.1);
  }
}

.source-card-inner {
  padding: 14px 16px;
  min-width: 0;
}

.source-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.source-icon {
  font-size: 18px;
  color: var(--gold-400);
  flex-shrink: 0;
}

.source-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.source-check {
  margin-left: auto;
  color: var(--gold-500);
  font-size: 16px;
}

.source-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

// ============ 表单提示 ============
.form-tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.form-tip-warning {
  color: var(--warning);
}

// ============ 提示卡 ============
.tip-card {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: var(--bg-subtle);
}

.tip-icon {
  font-size: 24px;
  color: var(--gold-400);
  flex-shrink: 0;
}

.tip-content {
  flex: 1;
  min-width: 0;
}

.tip-title {
  margin-bottom: 8px;
}

.tip-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.8;

  strong {
    color: var(--text-primary);
    font-weight: 600;
  }
}

// ============ 响应式 ============
@include tablet-down {
  .ticket-new-page {
    gap: 16px;
  }
  .page-title {
    font-size: 22px;
  }
  .card-header {
    padding: 14px 16px;
  }
  .card-body {
    padding: 20px 16px;
  }
  .source-radio-group {
    grid-template-columns: 1fr;
  }
}

// 手机端：表单全宽 + label 顶部对齐 + 输入框占满
@include mobile {
  .ticket-new-page {
    gap: 12px;
    max-width: 100%;
  }
  .page-title {
    font-size: 20px;
  }
  .card-header {
    padding: 12px 14px;
  }
  .card-title {
    font-size: 15px;
  }
  .card-body {
    padding: 14px 12px;
  }
  // 表单 label 顶部对齐、移除固定 label-width
  :deep(.el-form) {
    .el-form-item__label {
      float: none;
      display: block;
      text-align: left;
      padding: 0 0 6px;
      width: auto !important;
    }
    .el-form-item__content {
      margin-left: 0 !important;
    }
  }
  // 输入框、选择框、文本域全宽
  :deep(.el-input),
  :deep(.el-select),
  :deep(.el-textarea) {
    max-width: 100% !important;
  }
  :deep(.el-form-item) {
    .el-input,
    .el-select,
    .el-textarea__inner {
      max-width: 100% !important;
    }
  }

  // 提示卡纵向堆叠
  .tip-card {
    flex-direction: column;
    gap: 10px;
    padding: 14px;
  }
  .tip-icon {
    font-size: 20px;
  }
  .tip-list {
    font-size: 12px;
    line-height: 1.7;
  }
}
</style>
