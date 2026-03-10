import React, { useState, useEffect, useRef } from "react";
import type { Project } from "@domain/projectTypes";
import type { Task } from "@domain/taskTypes";
import { TaskForm } from "@components/TaskForm";
import { ProjectTree } from "@components/ProjectTree";

interface ProjectSidebarProps {
  projects: Project[];
  selectedProjectId: string | null;
  selectedTag: string | null;
  isFormOpen: boolean;
  editingTask: Task | null;
  allProjects: Project[];
  allTags: string[];

  onSelectProject(id: string | null): void;
  onSelectTag(tag: string | null): void;
  onCreateProject(name: string, parentId?: string): void;
  onRenameProject(id: string, newName: string): void;
  onDeleteProject(id: string): void;
  onRenameTag(oldName: string, newName: string): void;
  onDeleteTag(tagName: string): void;
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
  selectedTag,
  isFormOpen,
  editingTask,
  allProjects,
  allTags,

  onSelectProject,
  onSelectTag,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  onRenameTag,
  onDeleteTag,
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
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
  const [tagCtxMenu, setTagCtxMenu] = useState<{ x: number; y: number; tag: string } | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagEditValue, setTagEditValue] = useState("");
  const tagCtxMenuRef = useRef<HTMLDivElement>(null);
  const tagEditInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tagCtxMenu) return;
    function handleClick(e: MouseEvent) {
      if (tagCtxMenuRef.current && !tagCtxMenuRef.current.contains(e.target as Node)) {
        setTagCtxMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [tagCtxMenu]);

  useEffect(() => {
    if (editingTag) {
      tagEditInputRef.current?.focus();
      tagEditInputRef.current?.select();
    }
  }, [editingTag]);

  function commitTagEdit() {
    if (editingTag && tagEditValue.trim()) {
      const newName = tagEditValue.trim();
      if (!newName.includes(" ")) {
        onRenameTag(editingTag, newName);
      }
    }
    setEditingTag(null);
  }

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
            allTags={allTags}
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
        <div
          className="project-section-header collapsible"
          onClick={() => setProjectsCollapsed((c) => !c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setProjectsCollapsed((c) => !c);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={!projectsCollapsed}
          aria-label={projectsCollapsed ? "Expand Projects" : "Collapse Projects"}
        >
          <span className="section-toggle" aria-hidden="true">
            {projectsCollapsed ? "▶" : "▼"}
          </span>
          <h3>Projects</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowNewProject((v) => !v);
            }}
            aria-label="Create project"
            title="Create project"
          >
            +
          </button>
        </div>

        {!projectsCollapsed && showNewProject && (
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

        {!projectsCollapsed && (
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
        )}
      </div>

      <div className="project-section tags-section">
        <div
          className="project-section-header collapsible"
          onClick={() => setTagsCollapsed((c) => !c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setTagsCollapsed((c) => !c);
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={!tagsCollapsed}
          aria-label={tagsCollapsed ? "Expand Tags" : "Collapse Tags"}
        >
          <span className="section-toggle" aria-hidden="true">
            {tagsCollapsed ? "▶" : "▼"}
          </span>
          <h3>Tags</h3>
        </div>

        {!tagsCollapsed && (
          <ul className="tag-list" role="list">
            {allTags.length === 0 ? (
              <li className="tag-list-empty">No tags yet</li>
            ) : (
              allTags.map((tag) => (
                <li key={tag}>
                  {editingTag === tag ? (
                    <input
                      ref={tagEditInputRef}
                      className="tag-edit-input"
                      value={tagEditValue}
                      onChange={(e) => setTagEditValue(e.target.value)}
                      onBlur={commitTagEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitTagEdit();
                        if (e.key === "Escape") setEditingTag(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`tag-list-item${selectedTag === tag ? " selected" : ""}`}
                      onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTagCtxMenu({ x: e.clientX, y: e.clientY, tag });
                      }}
                    >
                      @{tag}
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {tagCtxMenu && (
        <div
          ref={tagCtxMenuRef}
          className="task-context-menu"
          style={{ top: tagCtxMenu.y, left: tagCtxMenu.x }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setEditingTag(tagCtxMenu.tag);
              setTagEditValue(tagCtxMenu.tag);
              setTagCtxMenu(null);
            }}
          >
            <span className="ctx-icon">✎</span> Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDeleteTag(tagCtxMenu.tag);
              setTagCtxMenu(null);
            }}
          >
            <span className="ctx-icon">✕</span> Delete
          </button>
        </div>
      )}
    </aside>
  );
};
