import React, { useState, useEffect, useRef } from "react";
import type { Task } from "@domain/taskTypes";
import { groupTasksByDate } from "@domain/taskSort";
import { formatRecurrenceShort } from "@domain/dateParser";

interface TaskListProps {
  tasks: Task[];
  onCompleteTask(id: string): void;
  onSelectTask?(id: string): void;
  onCloneTask?(id: string): void;
  onUncloneTask?(id: string): void;
  selectedTaskId?: string | null;
  highlightedTaskId?: string | null;
}

interface ContextMenuState {
  x: number;
  y: number;
  taskId: string;
  isClone: boolean;
}

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  onCompleteTask,
  onSelectTask,
  onCloneTask,
  onUncloneTask,
  selectedTaskId,
  highlightedTaskId,
}) => {
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeTasks = tasks.filter((task) => !task.completed && !task.deleted);
  const groups = groupTasksByDate(activeTasks);

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

  function handleContextMenu(e: React.MouseEvent, task: Task) {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      taskId: task.id,
      isClone: !!task.cloneGroupId,
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
      {groups.map((group) => (
        <section
          key={group.key}
          className={`date-group${group.isOverdue ? " overdue-group" : ""}`}
        >
          <div className="date-group-heading">
            <span
              className={`date-label${group.isOverdue ? " overdue-label" : ""}`}
            >
              {group.label}
            </span>
            <span className="task-count">{group.tasks.length}</span>
          </div>
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
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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
        </div>
      )}
    </div>
  );
};
