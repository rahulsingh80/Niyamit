import React, { useState } from "react";
import type { Project } from "@domain/projectTypes";
import type { Task } from "@domain/taskTypes";
import { TaskForm } from "@components/TaskForm";
import { ProjectTree } from "@components/ProjectTree";

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  isFormOpen: boolean;
  editingTask: Task | null;
  allProjects: Project[];

  onSelectProject(id: string | null): void;
  onCreateProject(name: string, parentId?: string): void;
  onRenameProject(id: string, newName: string): void;
  onDeleteProject(id: string): void;
  onMoveTaskToProject(taskId: string, projectId: string): void;
  onMoveProject(id: string, newParentId: string | undefined): void;
  onReorderProject(id: string, direction: "up" | "down"): void;

  onOpenCreateForm(): void;
  onCancelEdit(): void;
  onAddTask(task: Task): void;
  onUpdateTask(task: Task): void;
  onDeleteTask(id: string): void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  selectedProjectId,
  isFormOpen,
  editingTask,
  allProjects,

  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onMoveTaskToProject,
  onMoveProject,
  onReorderProject,

  onOpenCreateForm,
  onCancelEdit,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [nameError, setNameError] = useState("");

  const panelTitle = editingTask ? "Update Task" : "Create Task";
  const activeProjects = allProjects.filter((p) => !p.deleted);

  function isDuplicateName(name: string, excludeId?: string): boolean {
    return activeProjects.some(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== excludeId,
    );
  }

  function handleCreateProject() {
    const name = newProjectName.trim();
    if (!name) return;
    if (isDuplicateName(name)) {
      setNameError(`"${name}" already exists`);
      return;
    }
    onCreateProject(name);
    setNewProjectName("");
    setNameError("");
    setShowNewProject(false);
  }

  function handleCreateSubProject(parentId: string) {
    onCreateProject("New Project", parentId);
  }

  return (
    <aside className="app-sidebar">
      {isFormOpen ? (
        <div className="form-panel card">
          <div className="panel-header">
            <h2>{panelTitle}</h2>
            <button
              type="button"
              className="close-btn"
              onClick={onCancelEdit}
              aria-label="Close form"
            >
              ✕
            </button>
          </div>
          {editingTask && editingTask.projectId && (
            <div className="project-pill-bar">
              <span className="pill project-pill">
                {activeProjects.find((p) => p.id === editingTask.projectId)
                  ?.name || "Project"}
              </span>
            </div>
          )}
          <TaskForm
            key={editingTask?.id ?? "__create__"}
            onAdd={onAddTask}
            editingTask={editingTask}
            onUpdate={onUpdateTask}
            onDelete={onDeleteTask}
            onCancelEdit={onCancelEdit}
            projects={activeProjects}
            defaultProjectId={selectedProjectId}
          />
        </div>
      ) : (
        <button
          type="button"
          className="primary create-task-btn sidebar-create-btn"
          onClick={onOpenCreateForm}
        >
          + Create Task
        </button>
      )}

      <div className="project-section">
        <div className="project-section-header">
          <h3>Projects</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setShowNewProject((v) => !v)}
            aria-label="Create project"
            title="Create project"
          >
            +
          </button>
        </div>

        {showNewProject && (
          <div className="new-project-row-wrapper">
            <div className="new-project-row">
              <input
                type="text"
                className={`project-name-input${nameError ? " input-error" : ""}`}
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => { setNewProjectName(e.target.value); setNameError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                  if (e.key === "Escape") {
                    setShowNewProject(false);
                    setNewProjectName("");
                    setNameError("");
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                className="primary"
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
              >
                Add
              </button>
            </div>
            {nameError && <span className="project-name-error">{nameError}</span>}
          </div>
        )}

        <ProjectTree
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelectProject={onSelectProject}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
          onMoveTaskToProject={onMoveTaskToProject}
          onCreateSubProject={handleCreateSubProject}
          onMoveProject={onMoveProject}
          onReorderProject={onReorderProject}
        />
      </div>
    </aside>
  );
};
