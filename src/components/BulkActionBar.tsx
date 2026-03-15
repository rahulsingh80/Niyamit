import React, { useState, useRef, useEffect } from "react";
import type { Task } from "@domain/taskTypes";
import type { Project } from "@domain/projectTypes";
import type { TaskPriority } from "@domain/taskTypes";
import { ProjectSelect, NEW_PROJECT_PREFIX } from "@components/ProjectSelect";
import { TagSelect } from "@components/TagSelect";

interface BulkActionBarProps {
  selectedTaskIds: string[];
  tasks: Task[];
  projects: Project[];
  allTags: string[];
  onClearSelection(): void;
  onBulkDelete(ids: string[]): void;
  onBulkSetPriority(ids: string[], priority: TaskPriority): void;
  onBulkAddToProject(ids: string[], projectIdOrNew: string): void;
  onBulkApplyTag(ids: string[], tag: string): void;
}

type ModalKind = "none" | "delete" | "priority" | "project" | "tag";

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedTaskIds,
  tasks,
  projects,
  allTags,
  onClearSelection,
  onBulkDelete,
  onBulkSetPriority,
  onBulkAddToProject,
  onBulkApplyTag,
}) => {
  const [modal, setModal] = useState<ModalKind>("none");
  const [projectChoice, setProjectChoice] = useState<string | null>(null);
  const [tagChoice, setTagChoice] = useState<string | null>(null);
  const [showProjectWarning, setShowProjectWarning] = useState(false);
  const [pendingProjectSubmit, setPendingProjectSubmit] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const n = selectedTaskIds.length;
  const selectedSet = new Set(selectedTaskIds);
  const selectedTasks = tasks.filter((t) => selectedSet.has(t.id));

  const activeProjects = projects.filter((p) => !p.deleted);

  function getProjectName(projectIdOrNew: string): string {
    if (projectIdOrNew.startsWith(NEW_PROJECT_PREFIX)) {
      return projectIdOrNew.slice(NEW_PROJECT_PREFIX.length);
    }
    const p = activeProjects.find((x) => x.id === projectIdOrNew);
    return p?.name ?? projectIdOrNew;
  }

  function countTasksWithOtherProject(resolvedProjectId: string): number {
    return selectedTasks.filter(
      (t) => t.projectId != null && t.projectId !== resolvedProjectId,
    ).length;
  }

  function handleDeleteConfirm() {
    onBulkDelete(selectedTaskIds);
    setModal("none");
  }

  function handlePriorityChoose(priority: TaskPriority) {
    onBulkSetPriority(selectedTaskIds, priority);
    setModal("none");
  }

  function handleProjectSubmit(projectIdOrNew: string) {
    const count = countTasksWithOtherProject(projectIdOrNew);
    if (count > 0) {
      setPendingProjectSubmit(projectIdOrNew);
      setShowProjectWarning(true);
    } else {
      onBulkAddToProject(selectedTaskIds, projectIdOrNew);
      setModal("none");
      setProjectChoice(null);
    }
  }

  function handleProjectWarningConfirm() {
    if (pendingProjectSubmit) {
      onBulkAddToProject(selectedTaskIds, pendingProjectSubmit);
      setPendingProjectSubmit(null);
      setShowProjectWarning(false);
      setModal("none");
      setProjectChoice(null);
    }
  }

  function handleTagSubmit(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !trimmed.includes(" ")) {
      onBulkApplyTag(selectedTaskIds, trimmed);
      setModal("none");
      setTagChoice(null);
    }
  }

  useEffect(() => {
    if (modal !== "none") {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setModal("none");
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [modal]);

  if (n === 0) return null;

  return (
    <div ref={barRef} className="bulk-action-bar card">
      <span className="bulk-action-bar-label">
        {n} task{n !== 1 ? "s" : ""} selected
      </span>
      <button
        type="button"
        className="secondary bulk-action-btn"
        onClick={onClearSelection}
      >
        Clear selection
      </button>
      <button
        type="button"
        className="secondary bulk-action-btn"
        onClick={() => setModal("delete")}
      >
        Delete
      </button>
      <button
        type="button"
        className="secondary bulk-action-btn"
        onClick={() => setModal("priority")}
      >
        Change priority
      </button>
      <button
        type="button"
        className="secondary bulk-action-btn"
        onClick={() => setModal("project")}
      >
        Add to project
      </button>
      <button
        type="button"
        className="secondary bulk-action-btn"
        onClick={() => setModal("tag")}
      >
        Apply tag
      </button>

      {modal === "delete" && (
        <div className="bulk-modal-backdrop" role="presentation">
          <div className="bulk-modal card" role="dialog" aria-modal="true" aria-label="Confirm delete">
            <p>Delete {n} task{n !== 1 ? "s" : ""}?</p>
            <div className="bulk-modal-actions">
              <button type="button" className="secondary" onClick={() => setModal("none")}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleDeleteConfirm}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "priority" && (
        <div className="bulk-modal-backdrop" role="presentation">
          <div className="bulk-modal card" role="dialog" aria-modal="true" aria-label="Change priority">
            <p>Set priority for {n} task{n !== 1 ? "s" : ""}</p>
            <div className="bulk-priority-options">
              {([1, 2, 3, 4] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`secondary priority-${p}`}
                  onClick={() => handlePriorityChoose(p)}
                >
                  P{p}
                </button>
              ))}
            </div>
            <div className="bulk-modal-actions">
              <button type="button" className="secondary" onClick={() => setModal("none")}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "project" && !showProjectWarning && (
        <div className="bulk-modal-backdrop" role="presentation">
          <div className="bulk-modal card" role="dialog" aria-modal="true" aria-label="Add to project">
            <p>Add {n} task{n !== 1 ? "s" : ""} to project</p>
            <ProjectSelect
              projects={activeProjects}
              value={projectChoice}
              onChange={(id) => setProjectChoice(id)}
              placeholder="Search or type project name…"
              autoFocus
            />
            <div className="bulk-modal-actions">
              <button type="button" className="secondary" onClick={() => { setModal("none"); setProjectChoice(null); }}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!projectChoice}
                onClick={() => projectChoice && handleProjectSubmit(projectChoice)}
              >
                Add to project
              </button>
            </div>
          </div>
        </div>
      )}

      {showProjectWarning && pendingProjectSubmit && (
        <div className="bulk-modal-backdrop" role="presentation">
          <div className="bulk-modal card" role="dialog" aria-modal="true" aria-label="Confirm project change">
            <p>
              {countTasksWithOtherProject(
                pendingProjectSubmit.startsWith(NEW_PROJECT_PREFIX)
                  ? pendingProjectSubmit
                  : pendingProjectSubmit,
              )} task(s) are already in a project. This will move them to &quot;{getProjectName(pendingProjectSubmit)}&quot;. Continue?
            </p>
            <div className="bulk-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setShowProjectWarning(false);
                  setPendingProjectSubmit(null);
                  setModal("none");
                }}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={handleProjectWarningConfirm}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "tag" && (
        <div className="bulk-modal-backdrop" role="presentation">
          <div className="bulk-modal card" role="dialog" aria-modal="true" aria-label="Apply tag">
            <p>Apply tag to {n} task{n !== 1 ? "s" : ""}</p>
            <TagSelect
              allTags={allTags}
              value={tagChoice}
              onChange={(tag) => setTagChoice(tag)}
              placeholder="Search or type tag name…"
              autoFocus
            />
            <div className="bulk-modal-actions">
              <button type="button" className="secondary" onClick={() => { setModal("none"); setTagChoice(null); }}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={!tagChoice?.trim() || tagChoice.includes(" ")}
                onClick={() => tagChoice && handleTagSubmit(tagChoice)}
              >
                Apply tag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
