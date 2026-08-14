import type { ProductionGraphSocketAdapterSocket } from "./production-graph-wiring";

interface CanaryFrame {
  kind: "event" | "ack";
  event?: string;
  data?: unknown;
  requestId?: string;
}

export function createProductionGraphCanarySocket(baseUrl: string, auth: Record<string, unknown>): ProductionGraphSocketAdapterSocket {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const pending = new Map<string, (response: unknown) => void>();
  const queue: string[] = [];
  let sequence = 0;
  let connected = false;
  const url = new URL(baseUrl);
  Object.entries(auth).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const socket = new WebSocket(url.toString());

  const notify = (event: string, ...args: unknown[]) => listeners.get(event)?.forEach((listener) => listener(...args));
  const flush = () => {
    while (queue.length && socket.readyState === WebSocket.OPEN) socket.send(queue.shift()!);
  };
  socket.onopen = () => {
    connected = true;
    flush();
    notify("connect");
  };
  socket.onclose = () => {
    connected = false;
    notify("disconnect");
  };
  socket.onmessage = (message) => {
    let frame: CanaryFrame;
    try { frame = JSON.parse(String(message.data)) as CanaryFrame; } catch { return; }
    if (frame.kind === "ack" && frame.requestId) {
      const callback = pending.get(frame.requestId);
      if (callback) { pending.delete(frame.requestId); callback(frame.data); }
      return;
    }
    if (frame.kind === "event" && frame.event) notify(frame.event, frame.data);
  };

  return {
    get connected() { return connected; },
    on(event, listener) {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(listener);
      listeners.set(event, bucket);
      return this;
    },
    off(event, listener) {
      if (!listener) listeners.delete(event);
      else listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event, data, ack) {
      const requestId = ack ? String(++sequence) : undefined;
      if (requestId && ack) pending.set(requestId, ack);
      const frame = JSON.stringify({ kind: "event", event, data, requestId });
      if (connected && socket.readyState === WebSocket.OPEN) socket.send(frame);
      else queue.push(frame);
      return this;
    },
    disconnect() { socket.close(); },
    close() { socket.close(); },
  };
}
