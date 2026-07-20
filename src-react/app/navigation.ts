import type { LucideIcon } from "lucide-react";
import { Boxes, Clapperboard, Cuboid, FileText, FolderKanban, Images, ListTodo, NotebookText, Sparkles, Users } from "lucide-react";

export interface GlobalNavigationItem {
  label: string;
  to: "/projects" | "/tasks";
  icon: LucideIcon;
}

export interface ProjectNavigationItem {
  label: string;
  to:
    | "/projects/$projectId/novels"
    | "/projects/$projectId/scripts"
    | "/projects/$projectId/script-agent"
    | "/projects/$projectId/casting"
    | "/projects/$projectId/assets"
    | "/projects/$projectId/storyboards"
    | "/projects/$projectId/production"
    | "/projects/$projectId/director-desk";
  icon: LucideIcon;
}

export const globalNavigation: GlobalNavigationItem[] = [
  { label: "项目", to: "/projects", icon: FolderKanban },
  { label: "任务", to: "/tasks", icon: ListTodo },
];

export const projectNavigation: ProjectNavigationItem[] = [
  { label: "原文", to: "/projects/$projectId/novels", icon: NotebookText },
  { label: "剧本", to: "/projects/$projectId/scripts", icon: FileText },
  { label: "剧本智能体", to: "/projects/$projectId/script-agent", icon: Sparkles },
  { label: "选角", to: "/projects/$projectId/casting", icon: Users },
  { label: "资产", to: "/projects/$projectId/assets", icon: Boxes },
  { label: "分镜", to: "/projects/$projectId/storyboards", icon: Images },
  { label: "生产", to: "/projects/$projectId/production", icon: Clapperboard },
  { label: "3D 导演台", to: "/projects/$projectId/director-desk", icon: Cuboid },
];
