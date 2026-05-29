interface FlowProject {
  id: string;
  name: string;
  intro: string;
  workFlow: string | null;
  createTime: number;
}

export default defineStore(
  "flowProject",
  () => {
    const allFlowProject = ref<FlowProject[]>([]);

    const flowProject = ref<FlowProject | null>(null);

    return { allFlowProject, flowProject };
  },
  { persist: true },
);
