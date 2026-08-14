import { describe, expect, it, vi } from "vitest";

import { createProductionGraphCanarySocket } from "./production-graph-canary-socket";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  readonly sent: string[] = [];
  constructor(public readonly url: string) { FakeWebSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  close() { this.onclose?.(); }
  deliver(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>); }
}

describe("createProductionGraphCanarySocket", () => {
  it("maps native websocket frames to the ProductionGraph socket contract", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = createProductionGraphCanarySocket("ws://127.0.0.1:24681", { projectId: "7", token: "canary" });
    const events: unknown[] = [];
    socket.on("productionGraph:snapshot", (value) => events.push(value));
    const ack = vi.fn();
    socket.emit("productionGraph:action", { action: { action: "readGraph" } }, ack);
    const connection = FakeWebSocket.instances[0];
    connection.readyState = FakeWebSocket.OPEN;
    connection.onopen?.();
    connection.deliver({ kind: "event", event: "productionGraph:snapshot", data: { graphId: "canary-7" } });
    connection.deliver({ kind: "ack", requestId: "1", data: { ok: true } });

    expect(connection.url).toContain("projectId=7");
    expect(JSON.parse(connection.sent[0]).requestId).toBe("1");
    expect(events).toEqual([{ graphId: "canary-7" }]);
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });
});
