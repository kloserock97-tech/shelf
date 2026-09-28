<script setup lang="ts">
const on = defineModel<boolean>({ default: false });
defineProps<{ label: string }>();
</script>

<template>
  <button
    class="toggle"
    role="switch"
    :aria-checked="on"
    :aria-label="label"
    @click="on = !on"
  >
    <span class="toggle__knob" />
  </button>
</template>

<style scoped>
@import './spring-toggle.css';
</style>
