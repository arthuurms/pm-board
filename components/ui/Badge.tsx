"use client";
import clsx from "clsx";

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
};

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  ops_down: "Operação fora do ar",
  service_failure: "Falha de atendimento",
  revenue_loss: "Perda de venda/dado",
  communication: "Falha de comunicação",
  deadline_miss: "Prazo não cumprido",
  quality: "Problema de qualidade",
  process: "Falha de processo",
  external: "Causa externa",
  security: "Incidente de segurança",
  other: "Outro",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", SEVERITY_STYLES[severity])}>
      {SEVERITY_LABELS[severity] || severity}
    </span>
  );
}

export function CategoryLabel({ category }: { category: string }) {
  return <span>{CATEGORY_LABELS[category] || category}</span>;
}
