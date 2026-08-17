import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Non-browser static wiring contract for the Studio OS entry point.
 * Verifies that the isolated frontend entry (router + navigation) targets the
 * Studio OS feature without executing a browser.
 */
const ROUTER_PATH = fileURLToPath(new URL("../../app/router.tsx", import.meta.url));
const NAVIGATION_PATH = fileURLToPath(new URL("../../app/navigation.ts", import.meta.url));

const routerSource = readFileSync(ROUTER_PATH, "utf8");
const navigationSource = readFileSync(NAVIGATION_PATH, "utf8");

describe("Studio OS frontend entry wiring (non-browser static)", () => {
  it("imports the Studio OS feature into the router", () => {
    expect(routerSource).toContain('from "@react/features/studio-os"');
    expect(routerSource).toContain("createStudioOsApi");
    expect(routerSource).toContain("StudioOsPage");
  });

  it("registers the /studio-os protected route with the Studio OS page", () => {
    expect(routerSource).toContain('path: "/studio-os"');
    expect(routerSource).toContain("component: StudioOsRoutePage");
    expect(routerSource).toContain("studioOsRoute");
  });

  it("includes the studio-os route in the protected route tree", () => {
    const routeTree = routerSource.slice(routerSource.indexOf("const routeTree = rootRoute.addChildren"));
    expect(routeTree).toContain("studioOsRoute");
    expect(routeTree).toContain("projectsRoute");
    expect(routeTree).toContain("projectNovelRoute");
  });

  it("adds the 创作评估 navigation item bound to /studio-os", () => {
    expect(navigationSource).toContain('"/projects" | "/tasks" | "/studio-os"');
    expect(navigationSource).toContain('{ label: "创作评估", to: "/studio-os", icon: Star }');
  });

  it("keeps existing global and project navigation intact", () => {
    expect(navigationSource).toContain('{ label: "项目", to: "/projects", icon: FolderKanban }');
    expect(navigationSource).toContain('{ label: "任务", to: "/tasks", icon: ListTodo }');
    expect(navigationSource).toContain('"/projects/$projectId/director-desk"');
  });
});
