import type { LucideIcon } from "lucide-react";
import { FolderKanban, GitBranch, ListTodo } from "lucide-react";

export interface GlobalNavigationItem {
  label: string;
  to: "/projects" | "/tasks";
  icon: LucideIcon;
}

export interface ProjectNavigationItem {
  label: string;
  to:
    | "/projects/$projectId/novels"
    | "/projects/$projectId/canvas"
    | "/projects/$projectId/scripts"
    | "/projects/$projectId/script-agent"
    | "/projects/$projectId/casting"
    | "/projects/$projectId/assets"
    | "/projects/$projectId/storyboards"
    | "/projects/$projectId/production"
    | "/projects/$projectId/interactive"
    | "/projects/$projectId/director-desk";
  icon: LucideIcon;
}

export const globalNavigation: GlobalNavigationItem[] = [
  { label: "项目", to: "/projects", icon: FolderKanban },
  { label: "任务", to: "/tasks", icon: ListTodo },
];

export const projectNavigation: ProjectNavigationItem[] = [
  { label: "画布", to: "/projects/$projectId/canvas", icon: GitBranch },
];
