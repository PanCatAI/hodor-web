import { computed, provide, ref } from "vue";
import { storeToRefs } from "pinia";
import * as pluginFn from "@/utils/pluginFn";
import settingStore from "@/stores/setting";
import type { HANDLE_TYPE } from "@/utils/loadPluginNode";

interface HandleData {
  type: HANDLE_TYPE;
  value: unknown;
}

interface ProvideOptions {
  flowId: string;
  selectorTypes?: HANDLE_TYPE[];
  onSelect?: (data: HandleData) => void;
}

const darkMql = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(darkMql.matches);
darkMql.addEventListener("change", (e) => {
  systemDark.value = e.matches;
});

export function provideToonflowHost({ flowId, selectorTypes = [], onSelect }: ProvideOptions) {
  const { themeSetting, language } = storeToRefs(settingStore());
  const themeMode = computed(() => themeSetting.value.mode);
  const theme = computed<"light" | "dark">(() =>
    themeMode.value === "auto" ? (systemDark.value ? "dark" : "light") : themeMode.value,
  );

  provide("__toonflowHost__", {
    flowId,
    selector: selectorTypes.length > 0 && onSelect ? { types: selectorTypes, onSelect } : null,
    language,
    themeMode,
    theme,
    fn: pluginFn,
  });
}
