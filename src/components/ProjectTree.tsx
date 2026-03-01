import React, { useState, useEffect, useRef } from "react";
import type { Project } from "@domain/projectTypes";
import { getDescendantIds } from "@domain/projectTypes";

interface ProjectTreeProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelectProject(id: string | null): void;
  onRenameProject(id: string, newName: string): void;
  onDeleteProject(id: string): void;
  onMoveTaskToProject(taskId: string, projectId: string): void;
  onCreateSubProject?(parentId: string): void;
  onMoveProject?(id: string, newParentId: string | undefined): void;
  onReorderProject?(id: string, direction: "up" | "down"): void;
}

interface CtxMenu {
  x: number;
  y: number;
  projectId: string;
  showMoveUnder?: boolean;
}

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  projects,
  selectedProjectId,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onMoveTaskToProject,
  onCreateSubProject,
  onMoveProject,
  onReorderProject,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const treeRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const activeProjects = projects.filter((p) => !p.deleted);

  function getChildren(parentId?: string): Project[] {
    return activeProjects
      .filter((p) => (p.parentId || undefined) === parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  }

  function hasChildren(id: string): boolean {
    return activeProjects.some((p) => p.parentId === id);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildVisibleList(
    parentId?: string,
    depth = 0,
  ): { project: Project; depth: number }[] {
    const result: { project: Project; depth: number }[] = [];
    for (const p of getChildren(parentId)) {
      result.push({ project: p, depth });
      if (expandedIds.has(p.id) && hasChildren(p.id)) {
        result.push(...buildVisibleList(p.id, depth + 1));
      }
    }
    return result;
  }

  const visibleList = buildVisibleList();

  useEffect(() => {
    if (!ctxMenu) return;
    function handleClick(e: MouseEvent) {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node))
        setCtxMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ctxMenu]);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingId) return;
    const len = visibleList.length;
    if (len === 0) return;

    if (e.ctrlKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && focusedIdx >= 0) {
      e.preventDefault();
      const item = visibleList[focusedIdx];
      if (item) {
        onReorderProject?.(item.project.id, e.key === "ArrowUp" ? "up" : "down");
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, len - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "ArrowRight" && focusedIdx >= 0) {
      e.preventDefault();
      const item = visibleList[focusedIdx];
      if (item && hasChildren(item.project.id)) {
        setExpandedIds((prev) => new Set(prev).add(item.project.id));
      }
    } else if (e.key === "ArrowLeft" && focusedIdx >= 0) {
      e.preventDefault();
      const item = visibleList[focusedIdx];
      if (item) {
        if (expandedIds.has(item.project.id)) {
          setExpandedIds((prev) => {
            const next = new Set(prev);
            next.delete(item.project.id);
            return next;
          });
        } else if (item.project.parentId) {
          const parentIdx = visibleList.findIndex(
            (v) => v.project.id === item.project.parentId,
          );
          if (parentIdx >= 0) setFocusedIdx(parentIdx);
        }
      }
    } else if (e.key === "Enter" && focusedIdx >= 0) {
      e.preventDefault();
      const item = visibleList[focusedIdx];
      if (item) onSelectProject(item.project.id);
    }
  }

  function startEditing(p: Project) {
    setEditingId(p.id);
    setEditValue(p.name);
  }

  function commitEdit() {
    if (editingId && editValue.trim()) {
      onRenameProject(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  function handleContextMenu(e: React.MouseEvent, projectId: string) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, projectId, showMoveUnder: false });
  }

  function handleDragOver(e: React.DragEvent, projectId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(projectId);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  function handleDrop(e: React.DragEvent, projectId: string) {
    e.preventDefault();
    setDragOverId(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) onMoveTaskToProject(taskId, projectId);
  }

  // For "Move under project" submenu: eligible targets exclude self and descendants
  function getMoveTargets(projectId: string): Project[] {
    const excluded = new Set(getDescendantIds(projectId, activeProjects));
    return activeProjects.filter((p) => !excluded.has(p.id));
  }

  function renderNode(project: Project, depth: number, index: number) {
    const isSelected = selectedProjectId === project.id;
    const isFocused = focusedIdx === index;
    const isEditing = editingId === project.id;
    const isDragOver = dragOverId === project.id;
    const expanded = expandedIds.has(project.id);
    const children = hasChildren(project.id);

    let className = "project-node";
    if (isSelected) className += " selected";
    if (isFocused) className += " focused";
    if (isDragOver) className += " drop-target";

    return (
      <div
        key={project.id}
        className={className}
        style={{ paddingLeft: `${depth * 1.1 + 0.4}rem` }}
        onClick={() => {
          if (!isEditing) onSelectProject(project.id);
        }}
        onDoubleClick={() => startEditing(project)}
        onContextMenu={(e) => handleContextMenu(e, project.id)}
        onDragOver={(e) => handleDragOver(e, project.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, project.id)}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={children ? expanded : undefined}
        tabIndex={-1}
      >
        {children ? (
          <button
            type="button"
            className="project-toggle"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(project.id);
            }}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="project-toggle-spacer" />
        )}
        {isEditing ? (
          <input
            ref={editInputRef}
            className="project-name-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditingId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="project-name">{project.name}</span>
        )}
      </div>
    );
  }

  const ctxProject = ctxMenu ? activeProjects.find((p) => p.id === ctxMenu.projectId) : null;
  const moveTargets = ctxMenu ? getMoveTargets(ctxMenu.projectId) : [];

  return (
    <>
      <div
        ref={treeRef}
        className="project-tree"
        role="tree"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div
          className={`project-node all-tasks${selectedProjectId === null ? " selected" : ""}`}
          onClick={() => onSelectProject(null)}
          role="treeitem"
          aria-selected={selectedProjectId === null}
        >
          <span className="project-toggle-spacer" />
          <span className="project-name">All Tasks</span>
        </div>
        {visibleList.map(({ project, depth }, idx) =>
          renderNode(project, depth, idx),
        )}
      </div>

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="task-context-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCreateSubProject?.(ctxMenu.projectId);
              setCtxMenu(null);
            }}
          >
            <span className="ctx-icon">+</span> New sub-project
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const p = activeProjects.find((pr) => pr.id === ctxMenu.projectId);
              if (p) startEditing(p);
              setCtxMenu(null);
            }}
          >
            <span className="ctx-icon">✎</span> Rename
          </button>

          {moveTargets.length > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => setCtxMenu({ ...ctxMenu, showMoveUnder: !ctxMenu.showMoveUnder })}
            >
              <span className="ctx-icon">↳</span> Move under&hellip;
              <span className="ctx-chevron">{ctxMenu.showMoveUnder ? "▾" : "▸"}</span>
            </button>
          )}

          {ctxMenu.showMoveUnder && (
            <div className="ctx-submenu">
              {moveTargets.map((target) => (
                <button
                  key={target.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onMoveProject?.(ctxMenu.projectId, target.id);
                    setCtxMenu(null);
                  }}
                >
                  {target.name}
                </button>
              ))}
            </div>
          )}

          {ctxProject?.parentId && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onMoveProject?.(ctxMenu.projectId, undefined);
                setCtxMenu(null);
              }}
            >
              <span className="ctx-icon">↰</span> Move to top level
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onDeleteProject(ctxMenu.projectId);
              setCtxMenu(null);
            }}
          >
            <span className="ctx-icon">✕</span> Delete
          </button>
        </div>
      )}
    </>
  );
};
