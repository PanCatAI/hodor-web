import { ref, render, nextTick, type VNode } from "vue";

/**
 * 以编程方式挂载一个对话框组件并等待其结果。
 *
 * @param nodeFactory 每次需要重绘时调用，接收当前 visible 状态和 finish 回调，返回要渲染的 VNode
 * @returns Promise，resolve 时携带 finish 传入的结果
 */
export function openDialogWrapper<T>(nodeFactory: (visible: boolean, finish: (result: T) => void) => VNode): Promise<T> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const visible = ref(false);
    let done = false;

    const cleanup = () => {
      render(null, container);
      container.remove();
    };

    const finish = (result: T) => {
      if (done) return;
      done = true;
      visible.value = false;
      renderComp();
      resolve(result);
      setTimeout(cleanup, 350);
    };

    const renderComp = () => {
      const vnode = nodeFactory(visible.value, finish);
      const appContext = (document.querySelector("#app") as any)?.__vue_app__?._context;
      if (appContext) vnode.appContext = appContext;
      render(vnode, container);
    };

    renderComp();
    nextTick(() => {
      visible.value = true;
      renderComp();
    });
  });
}
