<template>
  <div class="flowWrap">
    <editFlow v-model="show" dataType="infiniteCanvas" :dataId="flowProject!.id" />
  </div>
</template>

<script setup lang="ts">
import editFlow from "@/components/edit/index.vue";
import flowProjectStore from "@/stores/flowProject";
const { flowProject } = storeToRefs(flowProjectStore());
const show = ref(true);
</script>

<style scoped lang="scss">
.flowWrap {
  width: 100%;
  height: 100%;
}
</style>
