import React from "react";
import type { Task } from "@domain/taskTypes";
import { sortTasks } from "@domain/taskSort";

interface TaskListProps {
  tasks: Task[];
}

export const TaskList: React.FC<TaskListProps> = ({ tasks }) => {
  const sorted = sortTasks(tasks);

  if (sorted.length === 0) {
    return (
      <div className="card empty">
        <p>No tasks yet. Add your first task above.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Tasks</h2>
      <ul className="task-list">
        {sorted.map((task) => (
          <li key={task.id} className="task-item">
            <div className="task-main">
              <div className="task-title-row">
                <span className="task-title">{task.title}</span>
                <span className={`priority pill priority-${task.priority}`}>
                  P{task.priority}
                </span>
              </div>
              {task.notes && <p className="task-notes">{task.notes}</p>}
            </div>
            <div className="task-meta">
              {task.dueDate ? (
                <span className="pill due-date">Due {task.dueDate}</span>
              ) : (
                <span className="pill no-due-date">No due date</span>
              )}
              <span className="created-at">
                Created {new Date(task.createdAt).toLocaleString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

