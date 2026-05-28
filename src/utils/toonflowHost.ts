import { computed, provide, ref, toValue, type MaybeRefOrGetter } from "vue";
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
  episodesId?: MaybeRefOrGetter<string | number | undefined>;
  projectId?: MaybeRefOrGetter<string | number | undefined>;
  selectorTypes?: HANDLE_TYPE[];
  onSelect?: (data: HandleData) => void;
}

const darkMql = window.matchMedia("(prefers-color-scheme: dark)");
const systemDark = ref(darkMql.matches);
darkMql.addEventListener("change", (e) => {
  systemDark.value = e.matches;
});

export function provideToonflowHost({ flowId, episodesId, projectId, selectorTypes = [], onSelect }: ProvideOptions) {
  const { themeSetting, language } = storeToRefs(settingStore());
  const themeMode = computed(() => themeSetting.value.mode);
  const theme = computed<"light" | "dark">(() => (themeMode.value === "auto" ? (systemDark.value ? "dark" : "light") : themeMode.value));

  provide("__toonflowHost__", {
    flowId,
    selector: selectorTypes.length > 0 && onSelect ? { types: selectorTypes, onSelect } : null,
    language,
    themeMode,
    theme,
    episodesId: computed(() => toValue(episodesId)),
    projectId: computed(() => toValue(projectId)),
    fn: pluginFn,
  });
}
