<template>
  <el-popover v-model:visible="visible" trigger="click" placement="bottom" :width="280"
    :popper-style="{ maxWidth: 'calc(100vw - 24px)', boxSizing: 'border-box' }">
    <template #reference>
      <button type="button" class="fleta-help" aria-label="Fleta 指数计算方法与说明" :aria-expanded="visible"
        @click.stop @keydown.stop @keydown.esc="visible = false">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" />
          <path d="M6.3 5.8a1.7 1.7 0 0 1 3.4 0c0 1.2-1.7 1.2-1.7 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          <circle cx="8" cy="10.7" r=".75" fill="currentColor" />
        </svg>
      </button>
    </template>
    <section class="fleta-explanation" aria-label="Fleta 指数说明" @keydown.esc.stop="visible = false">
      <div class="fleta-explanation-heading">
        <strong>Fleta 指数</strong>
        <button type="button" aria-label="关闭 Fleta 指数说明" @click="visible = false">×</button>
      </div>
      <p class="fleta-formula">个人最后一击 ÷ 所在队伍最后一击<br />× 200%</p>
      <p>衡量选手在队伍最后一击中的贡献占比。</p>
    </section>
  </el-popover>
</template>

<script setup>
import { ref } from 'vue';
const visible = ref(false);
</script>

<style scoped>
.fleta-help { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 20px; width: 20px; height: 24px; padding: 0; border: 0; background: transparent; color: #909399; vertical-align: middle; cursor: pointer; }
.fleta-help:hover, .fleta-help[aria-expanded="true"] { color: #ff6a00; }
.fleta-help:focus-visible { outline: 2px solid #ff6a00; outline-offset: -2px; border-radius: 3px; }
.fleta-explanation { color: #606266; font: 12px/1.7 var(--vis-font-body, sans-serif); text-align: left; white-space: normal; }
.fleta-explanation-heading { display: flex; align-items: center; justify-content: space-between; color: #303133; font-size: 13px; }
.fleta-explanation-heading button { width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: #909399; font-size: 20px; cursor: pointer; }
.fleta-explanation p { margin: 10px 0 0; }
.fleta-explanation .fleta-formula { padding: 8px 10px; border-left: 2px solid #ff6a00; background: #fff5eb; color: #a74700; font-weight: 600; }
</style>
