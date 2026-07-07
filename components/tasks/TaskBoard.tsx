"use client";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Task } from "@/types";
import TaskCard from "./TaskCard";

interface Props {
  tasks: Task[];
  permissions: Record<string, boolean>;
  onStatusChange: (taskId: string, newStatus: string) => void;
  onMarkRework: (taskId: string) => void;
  onRemoveRework: (taskId: string) => void;
  onTaskClick: (task: Task) => void;
}

const COLUMNS = [
  { key: "pending",     label: "Pendente",      color: "bg-slate-100 text-slate-600",  border: "border-slate-200" },
  { key: "in_progress", label: "Em andamento",  color: "bg-yellow-100 text-yellow-700", border: "border-yellow-200" },
  { key: "completed",   label: "Concluída",     color: "bg-green-100 text-green-700",   border: "border-green-200" },
];

// Map drag destination to allowed status transition
const ALLOWED: Record<string, Record<string, string>> = {
  pending:     { in_progress: "in_progress", completed: "completed" },
  in_progress: { pending: "pending", completed: "completed" },
  completed:   { pending: "pending", in_progress: "in_progress" },
};

export default function TaskBoard({ tasks, permissions, onStatusChange, onMarkRework, onRemoveRework, onTaskClick }: Props) {
  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const fromStatus = source.droppableId;
    const toStatus = destination.droppableId;

    // Check permission for the target status
    if (toStatus === "in_progress" && !permissions.move_in_progress) return;
    if (toStatus === "completed"   && !permissions.move_completed)   return;
    if (toStatus === "pending"     && !permissions.move_in_progress) return;

    onStatusChange(draggableId, toStatus);
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className={`bg-gray-50 rounded-xl border ${col.border} p-3`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${col.color}`}>
                  {col.label}
                </span>
                <span className="text-xs text-gray-400 font-medium">{colTasks.length}</span>
              </div>

              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[80px] rounded-lg transition-colors space-y-3 ${
                      snapshot.isDraggingOver ? "bg-violet-50 ring-2 ring-violet-200" : ""
                    }`}
                  >
                    {colTasks.length === 0 && !snapshot.isDraggingOver && (
                      <p className="text-xs text-gray-400 text-center py-8">Arraste tarefas aqui</p>
                    )}
                    {colTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                              opacity: snapshot.isDragging ? 0.85 : 1,
                            }}
                            className={snapshot.isDragging ? "rotate-1 shadow-xl" : ""}
                          >
                            <TaskCard
                              task={task}
                              permissions={permissions}
                              onStatusChange={onStatusChange}
                              onMarkRework={onMarkRework}
                              onRemoveRework={onRemoveRework}
                              onClick={() => onTaskClick(task)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
