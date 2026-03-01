export interface Project {
  id: string;
  name: string;
  /** undefined = root-level project */
  parentId?: string;
  /** Manual sort position within its sibling group. Lower = higher. */
  sortOrder?: number;
  createdAt: string;
  updatedAt?: string;
  deleted?: boolean;
}

/**
 * Collect the IDs of a project and all its descendants (recursive).
 */
export function getDescendantIds(
  projectId: string,
  projects: Project[],
): string[] {
  const ids = [projectId];
  const children = projects.filter(
    (p) => p.parentId === projectId && !p.deleted,
  );
  for (const child of children) {
    ids.push(...getDescendantIds(child.id, projects));
  }
  return ids;
}
