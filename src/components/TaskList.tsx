import React, { useState, useEffect, useRef, useMemo } from "react";
import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import { groupTasksByDate } from "@domain/taskSort";
import { formatRecurrenceShort } from "@domain/dateParser";

interface TaskListProps {
  tasks: Task[];
  onCompleteTask(id: string): void;
  onSelectTask?(id: string): void;
  onCloneTask?(id: string): void;
  onUncloneTask?(id: string): void;
  onDeleteTask?(id: string): void;
  onUpdateTask?(task: Task): void;
  onSelectProject?(projectId: string): void;
  selectedTaskId?: string | null;
  highlightedTaskId?: string | null;
  projects?: Project[];
}

interface ContextMenuState {
  x: number;
  y: number;
  taskId: string;
  isClone: boolean;
  projectId?: string;
}

const MAX_PROJECT_NAME_LEN = 18;

function truncateProjectName(name: string): string {
  if (name.length <= MAX_PROJECT_NAME_LEN) return name;
  const truncated = name.slice(0, MAX_PROJECT_NAME_LEN).replace(/\s+\S*$/, "");
  return truncated + "\u2026";
}

function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Returns target date YYYY-MM-DD if the group is a valid drop target for moving a task's due date; null otherwise. */
function getTargetDateFromGroupKey(
  key: string,
  todayStr: string,
  tomorrowStr: string,
): string | null {
  if (key === "overdue" || key === "later" || key === "no-date") return null;
  if (key === "today") return todayStr;
  if (key === "tomorrow") return tomorrowStr;
  if (key.startsWith("later-")) return key.slice(6);
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  return null;
}

function isDroppableGroup(
  group: { key: string; isSectionHeading?: boolean },
  todayStr: string,
  tomorrowStr: string,
): boolean {
  return getTargetDateFromGroupKey(group.key, todayStr, tomorrowStr) !== null;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onCompleteTask,
  onSelectTask,
  onCloneTask,
  onUncloneTask,
  onDeleteTask,
  onUpdateTask,
  onSelectProject,
  selectedTaskId,
  highlightedTaskId,
  projects = [],
}) => {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [dragOverGroupKey, setDragOverGroupKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) if (!p.deleted) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const activeTasks = tasks.filter((task) => !task.completed && !task.deleted);
  const groups = groupTasksByDate(activeTasks);

  const now = new Date();
  const todayStr = toLocalDateString(now);
  const tomorrowStr = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  function handleSectionDragOver(e: React.DragEvent, group: { key: string; isSectionHeading?: boolean }) {
    if (!onUpdateTask || !isDroppableGroup(group, todayStr, tomorrowStr)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverGroupKey(group.key);
  }

  function handleSectionDragLeave(e: React.DragEvent, groupKey: string) {
    if (dragOverGroupKey === groupKey) setDragOverGroupKey(null);
  }

  function handleSectionDrop(e: React.DragEvent, group: { key: string; isSectionHeading?: boolean }) {
    e.preventDefault();
    setDragOverGroupKey(null);
    if (!onUpdateTask) return;
    const targetDate = getTargetDateFromGroupKey(group.key, todayStr, tomorrowStr);
    if (targetDate == null) return;
    const taskId = e.dataTransfer.getData("text/plain");
    const task = activeTasks.find((t) => t.id === taskId);
    if (!task) return;

    let dueTime: string | undefined = task.dueTime;
    if (targetDate === todayStr && task.dueTime) {
      const [h, m] = task.dueTime.split(":").map(Number);
      const taskTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m ?? 0);
      if (taskTimeToday < now) dueTime = undefined;
    }

    onUpdateTask({
      ...task,
      dueDate: targetDate,
      dueTime,
      updatedAt: new Date().toISOString(),
    });
  }

  useEffect(() => {
    if (!ctxMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    }
    function handleScroll() {
      setCtxMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [ctxMenu]);

  useEffect(() => {
    function clearDragOver() {
      setDragOverGroupKey(null);
    }
    document.addEventListener("dragend", clearDragOver);
    document.addEventListener("drop", clearDragOver);
    return () => {
      document.removeEventListener("dragend", clearDragOver);
      document.removeEventListener("drop", clearDragOver);
    };
  }, []);

  function handleContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      taskId: task.id,
      isClone: !!task.cloneGroupId,
      projectId: task.projectId,
    });
  }

  if (groups.length === 0) {
    return (
      <div className="card empty">
        <p>No tasks yet. Create your first task!</p>
      </div>
    );
  }

  return (
    <div className="task-list-container">
      {groups.map((group) => {
        const droppable = isDroppableGroup(group, todayStr, tomorrowStr);
        const isDragOver = dragOverGroupKey === group.key;
        return (
        <section
          key={group.key}
          className={`date-group${group.isOverdue ? " overdue-group" : ""}${droppable ? " date-group-droppable" : ""}${isDragOver ? " date-group-drag-over" : ""}`}
          onDragOver={droppable ? (e) => handleSectionDragOver(e, group) : undefined}
          onDragLeave={droppable ? (e) => handleSectionDragLeave(e, group.key) : undefined}
          onDrop={droppable ? (e) => handleSectionDrop(e, group) : undefined}
        >
          <div className={`date-group-heading${group.isSectionHeading ? " section-heading-only" : ""}`}>
            <span
              className={`date-label${group.isOverdue ? " overdue-label" : ""}`}
            >
              {group.label}
            </span>
            {!group.isSectionHeading && (
              <span className="task-count">{group.tasks.length}</span>
            )}
          </div>
          {!group.isSectionHeading && (
          <ul className="task-list">
            {group.tasks.map((task) => {
              const isSelected = selectedTaskId === task.id;
              const isHighlighted = highlightedTaskId === task.id;
              let className = `task-item priority-${task.priority}`;
              if (isSelected) className += " task-selected";
              if (isHighlighted) className += " task-highlight-flash";
              return (
                <li
                  key={task.id}
                  className={className}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", task.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest(".task-complete-toggle")) return;
                    onSelectTask?.(task.id);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, task)}
                  style={{ cursor: onSelectTask ? "pointer" : undefined }}
                >
                  <div className="task-complete-toggle">
                    <input
                      type="radio"
                      name={`task-complete-${task.id}`}
                      aria-label="Mark task as completed"
                      onChange={() => onCompleteTask(task.id)}
                    />
                  </div>
                  <div className="task-item-content">
                    <div className="task-main">
                      <div className="task-title-row">
                        <span className="task-title">
                          {task.cloneGroupId && (
                            <span
                              className="clone-icon"
                              title="This task is a clone"
                              aria-label="Clone task"
                            >
                              ⧉
                            </span>
                          )}
                          {task.recurrence && (
                            <span
                              className="recurring-icon"
                              title={formatRecurrenceShort(task.recurrence)}
                              aria-label="Recurring task"
                            >
                              ↻
                            </span>
                          )}
                          {task.title}
                        </span>
                        <span className="task-pills">
                          {task.reminder && (
                            <span
                              className="reminder-icon-pill"
                              title="Has reminder"
                              aria-label="Has reminder"
                            >
                              🕐
                            </span>
                          )}
                          {task.projectId && projectMap.has(task.projectId) && (
                            <span className="pill project-tag-pill" title={projectMap.get(task.projectId)}>
                              {truncateProjectName(projectMap.get(task.projectId)!)}
                            </span>
                          )}
                          {task.recurrence && (
                            <span className="pill recurrence-pill">
                              {formatRecurrenceShort(task.recurrence)}
                            </span>
                          )}
                          {task.dueTime && (
                            <span className="pill time-pill">{task.dueTime}</span>
                          )}
                          <span
                            className={`priority pill priority-${task.priority}`}
                          >
                            P{task.priority}
                          </span>
                        </span>
                      </div>
                      {task.notes && <p className="task-notes">{task.notes}</p>}
                    </div>
                    {group.isOverdue && task.dueDate && (
                      <div className="task-meta">
                        <span className="pill overdue-pill">
                          Due {task.dueDate}
                          {task.dueTime ? ` ${task.dueTime}` : ""}
                        </span>
                      </div>
                    )}
                    {task.tags && task.tags.length > 0 && (
                      <div className="task-tags">
                        {task.tags.map((tag) => (
                          <span key={tag} className="pill tag-pill">@{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          )}
        </section>
        );
      })}

      {ctxMenu && (
        <div
          ref={menuRef}
          className="task-context-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCloneTask?.(ctxMenu.taskId);
              setCtxMenu(null);
            }}
          >
            <span className="ctx-icon">⧉</span> Clone
          </button>
          {ctxMenu.isClone && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onUncloneTask?.(ctxMenu.taskId);
                setCtxMenu(null);
              }}
            >
              <span className="ctx-icon">✂</span> Un-clone
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDeleteTask?.(ctxMenu.taskId);
              setCtxMenu(null);
            }}
          >
            <span className="ctx-icon">🗑</span> Delete
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!ctxMenu.projectId || !projectMap.has(ctxMenu.projectId)}
            onClick={() => {
              if (ctxMenu.projectId && projectMap.has(ctxMenu.projectId)) {
                onSelectProject?.(ctxMenu.projectId);
                setCtxMenu(null);
              }
            }}
          >
            <span className="ctx-icon">📁</span> Project
          </button>
        </div>
      )}
    </div>
  );
};
