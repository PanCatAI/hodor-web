import { describe, expect, it } from "vitest";

import { EvolutionStudioOsPage } from "./evolution-studio-os-page";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildMockStudioOsApi } from "./studio-os-test-utils";

describe("EvolutionStudioOsPage (non-browser SSR)", () => {
  it("composes the professional-creation evaluation entry", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<EvolutionStudioOsPage api={api} />);

    expect(html).toContain("Studio OS · 专业创作评估运行时");
    expect(html).toContain("证据状态");
    expect(html).toContain("创建画像（五种专业创作格式）");
    expect(html).toContain("专业编剧审核");
    expect(html).toContain("第四墙互动");
    expect(html).toContain("回滚状态");
  });

  it("declares the frozen package and idempotent rollback semantics", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<EvolutionStudioOsPage api={api} />);
    const text = staticText(html);

    expect(text).toContain("4ef737c60b1a7bf6691f2415254654ab00152ed1");
    expect(text).toContain("AINovel 原创性");
    expect(text).toContain("共生反馈");
    expect(text).toContain("匹配对照");
    expect(text).toContain("artifact:target-policy-v4");
    expect(html).toContain("professional-screenwriter-review");
  });
});
