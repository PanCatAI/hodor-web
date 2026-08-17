import { describe, expect, it } from "vitest";

import { StudioOsPage } from "./studio-os-page";
import { renderStatic, staticText } from "./studio-os-ssr";
import { buildMockStudioOsApi } from "./studio-os-test-utils";

describe("StudioOsPage (non-browser SSR)", () => {
  it("composes the Studio OS entry: creation profiles, review, fourth wall, evidence, and rollback status", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<StudioOsPage api={api} />);

    expect(html).toContain("Studio OS · 专业创作评估运行时");
    expect(html).toContain("证据状态");
    expect(html).toContain("创建画像（五种专业创作格式）");
    expect(html).toContain("专业编剧审核");
    expect(html).toContain("第四墙互动");
    expect(html).toContain("回滚状态");
    expect(html).toContain("审核与回滚证据绑定");
    expect(html).toContain("创建十域运行");
    expect(html).toContain("刷新全部视图");
  });

  it("declares the frozen v5 package binding and idempotent rollback semantics", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<StudioOsPage api={api} />);
    const text = staticText(html);

    expect(text).toContain("4ef737c60b1a7bf6691f2415254654ab00152ed1");
    expect(text).toContain("短剧");
    expect(text).toContain("AINovel 原创性");
    expect(text).toContain("专业编剧审核");
    expect(text).toContain("第四墙互动");
    expect(text).toContain("共生反馈");
    expect(text).toContain("匹配对照");
    expect(text).toContain("artifact:target-policy-v4");
    expect(html).toContain("professional-screenwriter-review");
    expect(html).toContain("artifact:target-policy-v5");
  });

  it("renders every view in its effect-driven loading state without a browser", () => {
    const { api } = buildMockStudioOsApi();
    const html = renderStatic(<StudioOsPage api={api} />);
    const text = staticText(html);

    expect(text).toContain("回滚状态");
    expect(text.match(/正在读取运行证据…/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
