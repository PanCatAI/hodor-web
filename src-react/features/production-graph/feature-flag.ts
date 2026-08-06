/**
 * ProductionGraph 功能开关。
 *
 * 第一阶段：默认通过环境/构建开关启用，但任何代码路径都必须先调用 isProductionGraphEnabled()；
 * 关闭时前端必须回退到旧的固定阶段路由和 productionRun 兼容事件，不得渲染 Graph 面板。
 *
 * 该开关的设计目标是允许 A/B 回退且不需要服务端重新部署。
 */

const STORAGE_KEY = "hodor.productionGraph.v1.enabled";
const ENV_FLAG_NAME = "VITE_PRODUCTION_GRAPH_V1_ENABLED";

export interface ProductionGraphFeatureFlag {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

interface BrowserLike {
  localStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}

interface EnvLike {
  [key: string]: string | undefined;
}

function resolveInitialEnabled(env: EnvLike, browser: BrowserLike): boolean {
  const stored = browser.localStorage?.getItem(STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  const envValue = env[ENV_FLAG_NAME];
  if (envValue !== undefined) {
    return envValue === "1" || envValue.toLowerCase() === "true";
  }
  return true;
}

export function createProductionGraphFeatureFlag(
  env: EnvLike = typeof import.meta !== "undefined" ? (import.meta as unknown as { env?: EnvLike }).env ?? {} : {},
  browser: BrowserLike = typeof window !== "undefined" ? window : {},
): ProductionGraphFeatureFlag {
  let enabled = resolveInitialEnabled(env, browser);
  const listeners = new Set<() => void>();

  return {
    isEnabled: () => enabled,
    setEnabled(next) {
      const value = Boolean(next);
      if (value === enabled) return;
      enabled = value;
      try {
        browser.localStorage?.setItem(STORAGE_KEY, value ? "true" : "false");
      } catch {
        // localStorage 可能在隐私模式下抛出；忽略，只在内存中保留。
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let singleton: ProductionGraphFeatureFlag | null = null;

export function getProductionGraphFeatureFlag(): ProductionGraphFeatureFlag {
  if (!singleton) singleton = createProductionGraphFeatureFlag();
  return singleton;
}

export function setProductionGraphEnabled(enabled: boolean): void {
  getProductionGraphFeatureFlag().setEnabled(enabled);
}
