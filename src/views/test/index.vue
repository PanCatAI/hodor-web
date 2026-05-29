<template>
  <div class="test">
    <t-button theme="primary" @click="test">测试按钮</t-button>
  </div>
</template>

<script setup lang="ts">
import createKnexProxy from "@/utils/umd/tRPC";

const db = createKnexProxy();
async function test() {
  const res = await db("o_image").orderBy("id", "desc").limit(10).offset(0).select("*");
}
</script>

<style lang="scss" scoped></style>
