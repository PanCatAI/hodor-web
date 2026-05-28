<template>
  <path :d="path" fill="none" stroke="transparent" stroke-width="40" class="edgeHitArea" @mouseenter="onEnter" @mouseleave="onLeave" />
  <path :d="path" fill="none" class="vue-flow__edge-path" :style="style" :marker-end="markerEnd" />
  <EdgeLabelRenderer>
    <i-cutting-one
      class="nodrag nopan edgeDeleteBtn"
      :class="{ edgeDeleteBtnVisible: hovered }"
      :style="btnStyle"
      @mouseenter="onEnter"
      @mouseleave="onLeave"
      @click.stop="removeEdges([id])"
      theme="outline"
      size="24"
      fill="#333" />
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { EdgeLabelRenderer, getSimpleBezierPath, useVueFlow } from "@vue-flow/core";
import type { EdgeProps } from "@vue-flow/core";

const props = defineProps<EdgeProps>();

const edgePath = computed(() =>
  getSimpleBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  }),
);

const path = computed(() => edgePath.value[0]);
const btnStyle = computed(() => ({
  position: 'absolute' as const,
  transform: `translate(-50%, -50%) translate(${edgePath.value[1]}px, ${edgePath.value[2]}px)`,
  pointerEvents: 'all' as const,
}));

const { removeEdges } = useVueFlow();

const hovered = ref(false);
let leaveTimer: ReturnType<typeof setTimeout>;

const onEnter = () => {
  clearTimeout(leaveTimer);
  hovered.value = true;
};
const onLeave = () => {
  leaveTimer = setTimeout(() => {
    hovered.value = false;
  }, 200);
};

onBeforeUnmount(() => clearTimeout(leaveTimer));
</script>

<style lang="scss" scoped>
.edgeHitArea {
  pointer-events: stroke;
}

.edgeDeleteBtn {
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  &.edgeDeleteBtnVisible {
    opacity: 1;
  }
}
</style>
