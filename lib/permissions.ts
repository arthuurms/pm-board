import { prisma } from "./prisma";

export type Action =
  | "create_task"
  | "move_in_progress"
  | "move_completed"
  | "mark_rework"
  | "create_incident"
  | "manage_permissions"
  | "view_all_tasks";

export const ALL_ACTIONS: Action[] = [
  "create_task",
  "move_in_progress",
  "move_completed",
  "mark_rework",
  "create_incident",
  "manage_permissions",
  "view_all_tasks",
];

export const ACTION_LABELS: Record<Action, string> = {
  create_task: "Criar tarefas",
  move_in_progress: "Mover para Em andamento",
  move_completed: "Mover para Concluída",
  mark_rework: "Marcar como retrabalho",
  create_incident: "Registrar incidente",
  manage_permissions: "Gerenciar permissões",
  view_all_tasks: "Ver tarefas de todo mundo (exceto admins)",
};

/**
 * Check if a user has permission to perform an action.
 * Admins always have full access.
 */
export async function hasPermission(userId: string, action: Action): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { permissions: { where: { action } } },
  });

  if (!user) return false;
  if (user.role === "admin") return true;

  const perm = user.permissions[0];
  return perm?.granted ?? false;
}

/**
 * Get all permissions for a user as a map.
 */
export async function getUserPermissions(userId: string): Promise<Record<Action, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { permissions: true },
  });

  if (!user) return Object.fromEntries(ALL_ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;

  // Admins always get full access
  if (user.role === "admin") {
    return Object.fromEntries(ALL_ACTIONS.map((a) => [a, true])) as Record<Action, boolean>;
  }

  const permMap = Object.fromEntries(user.permissions.map((p) => [p.action, p.granted]));
  return Object.fromEntries(ALL_ACTIONS.map((a) => [a, permMap[a] ?? false])) as Record<Action, boolean>;
}
