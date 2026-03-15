import React, { useState, useRef, useEffect } from "react";
import type { Project } from "@domain/projectTypes";

export const NEW_PROJECT_PREFIX = "new:";

interface ProjectSelectProps {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const ProjectSelect: React.FC<ProjectSelectProps> = ({
  projects,
  value,
  onChange,
  placeholder = "Search or type project name…",
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeProjects = projects.filter((p) => !p.deleted);
  const query = inputValue.trim().toLowerCase();
  const filtered = query
    ? activeProjects.filter((p) =>
        p.name.toLowerCase().includes(query),
      )
    : activeProjects;
  const exactMatch = query && activeProjects.some(
    (p) => p.name.toLowerCase() === query,
  );
  const showCreateOption = query && !exactMatch;
  const displayOptions = showCreateOption
    ? [
        ...filtered.map((p) => ({ id: p.id, name: p.name })),
        { id: `${NEW_PROJECT_PREFIX}${inputValue.trim()}`, name: inputValue.trim() },
      ]
    : filtered.map((p) => ({ id: p.id, name: p.name }));

  useEffect(() => {
    if (isOpen && displayOptions.length > 0) {
      setHighlightIndex(0);
    }
  }, [isOpen, inputValue]);

  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, isOpen]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function selectOption(option: { id: string; name: string }) {
    onChange(option.id);
    setInputValue(option.name);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      setHighlightIndex((i) => (i + 1) % displayOptions.length);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlightIndex((i) => (i - 1 + displayOptions.length) % displayOptions.length);
      e.preventDefault();
    } else if (e.key === "Enter") {
      const opt = displayOptions[highlightIndex];
      if (opt) {
        selectOption(opt);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      e.preventDefault();
    }
  }

  return (
    <div className="project-select">
      <input
        ref={inputRef}
        type="text"
        className="project-select-input"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="project-select-list"
        aria-activedescendant={isOpen && displayOptions[highlightIndex] ? `project-opt-${highlightIndex}` : undefined}
      />
      {isOpen && displayOptions.length > 0 && (
        <div
          id="project-select-list"
          ref={listRef}
          className="project-select-dropdown"
          role="listbox"
        >
          {displayOptions.map((opt, idx) => (
            <div
              key={opt.id}
              id={`project-opt-${idx}`}
              role="option"
              aria-selected={idx === highlightIndex}
              className={`project-select-option${idx === highlightIndex ? " highlighted" : ""}${opt.id.startsWith(NEW_PROJECT_PREFIX) ? " create-option" : ""}`}
              onMouseEnter={() => setHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectOption(opt);
              }}
            >
              {opt.id.startsWith(NEW_PROJECT_PREFIX) ? (
                <>Create project: {opt.name}</>
              ) : (
                opt.name
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
