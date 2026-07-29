import { describe, expect, it } from "vitest";

import { normalizeAgentDeployments } from "./agent-deploy-view";

describe("normalizeAgentDeployments", () => {
  it("pins the universal text model and explains its production role", () => {
    const result = normalizeAgentDeployments([
      {
        id: 1,
        key: "scriptAgent",
        name: "剧本智能体",
        desc: "生成剧本",
        model: "DeepSeek",
        modelName: "deepseek:chat",
        vendorId: "deepseek",
      },
      {
        id: 3,
        key: "universalAi",
        name: "通用AI",
        desc: "旧描述",
        model: "DeepSeek",
        modelName: "deepseek:chat",
        vendorId: "deepseek",
      },
    ]);

    expect(result[0]).toMatchObject({
      key: "universalAi",
      name: "通用文本模型",
    });
    expect(result[0].desc).toContain("原文事件分析");
    expect(result[1].key).toBe("scriptAgent");
  });

  it("does not invent an unsaveable deployment when the backend omits it", () => {
    const input = [
      {
        id: 1,
        key: "scriptAgent",
        name: "剧本智能体",
        desc: "生成剧本",
        model: "",
        modelName: "",
        vendorId: null,
      },
    ];

    expect(normalizeAgentDeployments(input)).toEqual(input);
  });
});
