import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Non-browser static wiring contract for the Studio OS entry point.
 * Verifies that the isolated frontend entry (router + navigation) targets the
 * Studio OS feature without executing a browser.
 */
const ROUTER_PATH = path.resolve(process.cwd(), "src-react/app/router.tsx");
const NAVIGATION_PATH = path.resolve(process.cwd(), "src-react/app/navigation.ts");

const routerSource = readFileSync(ROUTER_PATH, "utf8");
const navigationSource = readFileSync(NAVIGATION_PATH, "utf8");

describe("Studio OS frontend entry wiring (non-browser static)", () => {
  it("imports the Studio OS feature into the router", () => {
    expect(routerSource).toContain('from "@react/features/studio-os"');
    expect(routerSource).toContain("createEvolutionStudioOsApi");
    expect(routerSource).toContain("EvolutionStudioOsPage");
  });

  it("registers one project-bound Studio OS route containing both views", () => {
    expect(routerSource).toContain('path: "/projects/$projectId/studio-os"');
    expect(routerSource).toContain("component: ProjectStudioOsRoutePage");
    expect(routerSource).toContain("<StudioOsPage");
    expect(routerSource).toContain("<EvolutionStudioOsPage");
    expect(routerSource).not.toContain('path: "/studio-os"');
  });

  it("includes the studio-os route in the protected route tree", () => {
    const routeTree = routerSource.slice(routerSource.indexOf("const routeTree = rootRoute.addChildren"));
    expect(routeTree).toContain("projectStudioOsRoute");
    expect(routeTree).toContain("projectsRoute");
    expect(routeTree).toContain("projectNovelRoute");
  });

  it("keeps a single project Studio OS navigation item", () => {
    expect(navigationSource).toContain('{ label: "控制室", to: "/projects/$projectId/studio-os", icon: PanelsTopLeft }');
    expect(navigationSource).not.toContain('to: "/studio-os"');
  });

  it("keeps existing global and project navigation intact", () => {
    expect(navigationSource).toContain('{ label: "项目", to: "/projects", icon: FolderKanban }');
    expect(navigationSource).toContain('{ label: "任务", to: "/tasks", icon: ListTodo }');
    expect(navigationSource).toContain('"/projects/$projectId/director-desk"');
  });
});
