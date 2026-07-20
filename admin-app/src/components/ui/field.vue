<template>
  <view class="field">
    <view v-if="label" class="field-label">
      {{ label }}
      <text v-if="required" class="req">*</text>
    </view>
    <view class="field-input-affix" v-if="type === 'password' || suffix">
      <input
        class="field-input"
        :class="inputClass"
        :type="inputType"
        :value="modelValue"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :disabled="disabled"
        @input="$emit('update:modelValue', $event.detail.value)"
      />
      <view v-if="suffix" class="suffix" @click="$emit('suffix-click')">
        <ui-icon :name="suffix" :size="32" />
      </view>
    </view>
    <textarea
      v-else-if="type === 'textarea'"
      class="field-textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.detail.value)"
    />
    <picker
      v-else-if="type === 'select'"
      :value="modelValue"
      :range="options"
      range-key="label"
      @change="onSelect"
    >
      <view class="field-select field-select-text">
        <text v-if="selectedLabel">{{ selectedLabel }}</text>
        <text v-else class="placeholder">{{ placeholder }}</text>
        <ui-icon class="picker-arrow" name="chevron-down" :size="32" />
      </view>
    </picker>
    <input
      v-else
      class="field-input"
      :class="inputClass"
      :type="inputType"
      :value="modelValue"
      :placeholder="placeholder"
      :maxlength="maxlength"
      :disabled="disabled"
      @input="$emit('update:modelValue', $event.detail.value)"
    />
    <view v-if="hint" class="field-hint">
      <ui-icon v-if="hintIcon" :name="hintIcon" :size="24" />
      <text>{{ hint }}</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'Field',
  props: {
    modelValue: { type: [String, Number], default: '' },
    label: { type: String, default: '' },
    type: { type: String, default: 'text' }, // text/password/textarea/select/number
    placeholder: { type: String, default: '' },
    options: { type: Array, default: () => [] }, // [{label, value}]
    required: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    maxlength: { type: [Number, String], default: -1 },
    hint: { type: String, default: '' },
    hintIcon: { type: String, default: '' },
    suffix: { type: String, default: '' },
    inputClass: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'suffix-click', 'change'],
  computed: {
    inputType() {
      if (this.type === 'number') return 'number';
      if (this.type === 'password') return 'password';
      return 'text';
    },
    selectedLabel() {
      const found = this.options.find((o) => o.value === this.modelValue);
      return found ? found.label : '';
    },
  },
  methods: {
    onSelect(e) {
      const idx = e.detail.value;
      const opt = this.options[idx];
      if (opt) {
        this.$emit('update:modelValue', opt.value);
        this.$emit('change', opt.value);
      }
    },
  },
};
</script>

<style scoped>
.field-select-text {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--color-text);
}
.placeholder { color: var(--color-text-muted); }
.picker-arrow { color: var(--color-text-muted); }
.field-hint { display: flex; align-items: center; gap: 8rpx; }
</style>
