export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "in_progress" | "completed";
export type IncidentCategory = "ops_down" | "service_failure" | "revenue_loss";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  position?: string | null;
  createdAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface StatusHistory {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  note?: string | null;
  changedBy: { id: string; name: string };
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: Priority;
  status: TaskStatus;
  isRework: boolean;
  reworkCount: number;
  onTime?: boolean | null;
  approved: boolean;
  approvedAt?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  tagId?: string | null;
  tag?: Tag | null;
  dueDate: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  assigneeId: string;
  assignee: { id: string; name: string; email: string };
  creatorId: string;
  creator: { id: string; name: string };
  originalTaskId?: string | null;
  statusHistory: StatusHistory[];
}

export interface Incident {
  id: string;
  title: string;
  description?: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  occurredAt: string;
  createdAt: string;
  reportedById: string;
  reportedBy: { id: string; name: string };
  relatedUserId?: string | null;
}

export interface Goal {
  id: string;
  title: string;
  description?: string | null;
  completed: boolean;
  completedAt?: string | null;
  createdAt: string;
  assigneeId: string;
  assignee: { id: string; name: string };
  creatorId: string;
  creator: { id: string; name: string };
}

export interface UserWithPermissions extends User {
  permissions: { action: string; granted: boolean }[];
}

export interface Metrics {
  incidentCount: number;
  incidentsByCategory: Record<string, number>;
  reworkRate: number;
  slaRate: number;
  totalCompleted: number;
  totalRework: number;
  onTimeCount: number;
}

export interface MonthlyTrend {
  month: string;
  reworkRate: number;
  slaRate: number;
  incidents: number;
}
