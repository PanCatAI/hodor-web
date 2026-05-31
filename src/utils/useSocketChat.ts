import settingStore from "@/stores/setting";
import { io, Socket } from "socket.io-client";
import type { ChatMessagesData, AIMessage, UserMessage, AIMessageContent, ChatMessageStatus } from "@tdesign-vue-next/chat";

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
  socket.send("syncMessages", messages.value);

  // 后端推送消息变更时，同步到本地（避免循环触发）
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
