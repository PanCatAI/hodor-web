import _ from "lodash";
import { remoteTools, type ToolCoonfig } from "@/utils/umd/index";
import settingStore from "@/stores/setting";
import { io, Socket } from "socket.io-client";
import type { ChatMessagesData, ChatMessageStatus } from "@tdesign-vue-next/chat";

function useSocket(url = "http://localhost:10588", authOptions?: Record<string, any>) {
  let socket: Socket | null = null;
  const connected = ref(false);

  const connect = () => {
    if (socket) {
      if (socket.disconnected) socket.connect();
      return;
    }

    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      auth: { token: localStorage.getItem("token"), ...authOptions },
    });

    socket.on("connect", () => (connected.value = true));
    socket.on("disconnect", () => (connected.value = false));
    socket.on("connect_error", () => (connected.value = false));
  };

  const disconnect = () => {
    socket?.disconnect();
    connected.value = false;
  };

  const send = (event: string, ...args: any[]) => socket?.emit(event, ...args);
  const on = (event: string, callback: (...args: any[]) => void) => socket?.on(event, callback);
  const off = (event: string, callback?: (...args: any[]) => void) => socket?.off(event, callback);

  return { connected, socket: { connect, disconnect, send, on, off } };
}

export default () => {
  const messages = ref<ChatMessagesData[]>([]);
  let isSyncingFromServer = false;

  const { connected, socket } = useSocket(`${settingStore().baseUrl}/socket/productionAgent`);
  socket.connect();

  //同步远端工具
  watch(
    remoteTools,
    (newVal) => {
      const remoteToolsList = Object.entries(newVal as ToolCoonfig).flatMap(([groupKey, groupValue]) =>
        Object.entries(groupValue ?? {}).map(([toolKey, toolValue]) => ({
          path: `${groupKey}.${toolKey}`,
          description: toolValue.description,
          jsonSchema: toolValue?.inputSchema.toJSONSchema() ?? null,
        })),
      );
      if (remoteToolsList.length > 0) socket.send("remoteTools", remoteToolsList);
    },
    { deep: true, immediate: true },
  );

  socket.on("runRemoteTool", ({ name, args }, callback) => {
    try {
      const tool = _.get(remoteTools.value, name) as unknown as ToolCoonfig | undefined;
      const input = JSON.parse(args);
      tool?.inputSchema.parse(input);
      const result = tool?.execute(input);
      callback({ state: "success", result });
    } catch (error) {
      callback({ state: "error", error: error instanceof Error ? error.message : String(error) });
    }
  });

  //同步历史消息
  socket.send("syncMessages", messages.value);
  socket.on("syncMessages", (serverMessages: ChatMessagesData[]) => {
    isSyncingFromServer = true;
    messages.value = serverMessages;
    nextTick(() => (isSyncingFromServer = false));
  });

  watch(
    messages,
    (newVal) => {
      if (!isSyncingFromServer) socket.send("syncMessages", newVal);
    },
    { deep: true },
  );

  const sendMessage = (text: string) => {
    socket.send("chat", text);
  };

  return {
    messages,
    sendMessage,
  };
};
