"use client";
import { useState } from "react";
import { Task } from "@/types";
import { PriorityBadge, StatusBadge } from "@/components/ui/Badge";
import { Calendar, User2, RotateCcw, Clock, CheckCircle, XCircle, GripVertical, Plus, Minus, X, Pencil, Trash2, ThumbsUp, Paperclip } from "lucide-react";
import clsx from "clsx";

interface Props {
  task: Task;
  permissions: Record<string, boolean>;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onMarkRework: (taskId: string) => void;
  onRemoveRework: (taskId: string) => void;
  onApprove?: (taskId: string) => void;
  currentUserId?: string;
  onEdit?: (task: Task) => void;
  onDelete?: (taskId: string) => void;
  onClick: () => void;
}

function isOverdue(task: Task) {
  if (task.status === "completed") return false;
  return new Date(task.dueDate) < new Date();
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Inline confirmation dialog component
function ConfirmRework({ taskTitle, onConfirm, onCancel }: {
  taskTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4 text-orange-600" />
            </div>
            <p className="font-semibold text-gray-900 text-sm">Registrar retrabalho?</p>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          Confirma que a tarefa abaixo precisará de correção?
        </p>
        <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">
          {taskTitle}
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
          >
            Confirmar retrabalho
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TaskCard({ task, permissions, onStatusChange, onMarkRework, onRemoveRework, onApprove, currentUserId, onEdit, onDelete, onClick }: Props) {
  const overdue = isOverdue(task);
  const canApprove = task.status === "completed" && !task.approved && currentUserId === task.creatorId;
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  function handleAddRework() {
    setShowConfirm(true);
  }

  function handleConfirm() {
    setShowConfirm(false);
    onMarkRework(task.id);
  }

  return (
    <>
      <div
        className={clsx(
          "bg-white rounded-xl border p-4 hover:shadow-md transition-shadow cursor-pointer select-none",
          task.isRework && "border-l-4 border-l-orange-400",
          overdue && !task.isRework && "border-l-4 border-l-red-400"
        )}
        onClick={onClick}
      >
        {/* drag handle + title */}
        <div className="flex items-start gap-1 mb-2">
          <GripVertical className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />
          <div className="flex-1 flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 leading-snug flex-1">{task.title}</p>
            {task.attachmentUrl && <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />}
            {task.isRework && (
              <span className="shrink-0 inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                <RotateCcw className="w-3 h-3" />
                Retrabalho
                {task.reworkCount > 0 && (
                  <span className="bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">
                    {task.reworkCount}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
          <span className="flex items-center gap-1">
            <User2 className="w-3 h-3" />
            {task.assignee.name}
          </span>
          <span className={clsx("flex items-center gap-1", overdue && "text-red-500 font-medium")}>
            <Calendar className="w-3 h-3" />
            {fmtDate(task.dueDate)}
            {overdue && " • Atrasada"}
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            <Clock className="w-3 h-3" />
            Criado {fmtDateTime(task.createdAt)} por {task.creator.name}
          </span>
        </div>

        {task.status === "completed" && task.completedAt && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {task.onTime ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                <CheckCircle className="w-3 h-3" /> Concluída {fmtDateTime(task.completedAt)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">
                <XCircle className="w-3 h-3" /> Concluída {fmtDateTime(task.completedAt)} · Fora do prazo
              </span>
            )}
            {task.approved && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-medium">
                <ThumbsUp className="w-3 h-3" /> Tarefa correta
              </span>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
          {task.status === "pending" && permissions.move_in_progress && (
            <button
              onClick={() => onStatusChange(task.id, "in_progress")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors"
            >
              <Clock className="w-3 h-3" /> Iniciar
            </button>
          )}
          {task.status === "in_progress" && permissions.move_completed && (
            <button
              onClick={() => onStatusChange(task.id, "completed")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              <CheckCircle className="w-3 h-3" /> Concluir
            </button>
          )}
          {task.status === "completed" && permissions.move_in_progress && (
            <button
              onClick={() => onStatusChange(task.id, "in_progress")}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Reabrir
            </button>
          )}
          {canApprove && onApprove && (
            <button
              onClick={() => onApprove(task.id)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-medium"
              title="Confirmar que a tarefa foi entregue corretamente"
            >
              <ThumbsUp className="w-3 h-3" /> Tarefa Correta
            </button>
          )}

          {onEdit && (
            <button
              onClick={() => onEdit(task)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              title="Editar tarefa"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
              title="Excluir tarefa"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {permissions.mark_rework && (
            <div className="flex items-center gap-0.5">
              {/* Remove one rework — only visible when count > 0 */}
              {task.reworkCount > 0 && (
                <button
                  onClick={() => onRemoveRework(task.id)}
                  className="flex items-center justify-center w-6 h-6 rounded-l bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors border border-orange-200"
                  title="Remover 1 retrabalho"
                >
                  <Minus className="w-3 h-3" />
                </button>
              )}
              {/* Add rework */}
              <button
                onClick={handleAddRework}
                className={clsx(
                  "flex items-center gap-1 text-xs px-2 py-1 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors border border-orange-200",
                  task.reworkCount > 0 ? "rounded-r" : "rounded"
                )}
                title="Registrar +1 retrabalho"
              >
                <RotateCcw className="w-3 h-3" />
                <Plus className="w-2.5 h-2.5" />
                Retrabalho
                {task.reworkCount > 0 && (
                  <span className="bg-orange-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">
                    {task.reworkCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <p className="font-semibold text-gray-900 text-sm">Excluir tarefa?</p>
            </div>
            <p className="text-sm text-gray-600 mb-1">Esta ação não pode ser desfeita:</p>
            <p className="text-sm font-medium text-gray-800 bg-gray-50 rounded-lg px-3 py-2 mb-4 truncate">{task.title}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={() => { setShowDeleteConfirm(false); onDelete!(task.id); }} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmRework
          taskTitle={task.title}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
