export default defineStore(
  "flowProject",
  () => {
    const allFlowProject = ref<FlowProject[]>([]);

    const flowProject = ref<FlowProject | null>(null);

    return { allFlowProject, flowProject };
  },
  { persist: true },
);
