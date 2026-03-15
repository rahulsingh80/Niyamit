import React, { useState, useRef, useEffect } from "react";

interface TagSelectProps {
  allTags: string[];
  value: string | null;
  onChange: (tag: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export const TagSelect: React.FC<TagSelectProps> = ({
  allTags,
  value,
  onChange,
  placeholder = "Search or type tag name…",
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const query = inputValue.trim().toLowerCase();
  const filtered = query
    ? allTags.filter((t) => t.toLowerCase().includes(query))
    : allTags;
  const exactMatch = query && allTags.some((t) => t.toLowerCase() === query);
  const showCreateOption = query && !exactMatch && !query.includes(" ");
  const displayOptions = showCreateOption
    ? [...filtered, inputValue.trim()]
    : filtered;

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

  function selectTag(tag: string) {
    onChange(tag);
    setInputValue(tag);
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
      const tag = displayOptions[highlightIndex];
      if (tag) {
        selectTag(tag);
        e.preventDefault();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      e.preventDefault();
    }
  }

  return (
    <div className="tag-select">
      <input
        ref={inputRef}
        type="text"
        className="tag-select-input"
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
        aria-controls="tag-select-list"
        aria-activedescendant={isOpen && displayOptions[highlightIndex] ? `tag-opt-${highlightIndex}` : undefined}
      />
      {isOpen && displayOptions.length > 0 && (
        <div
          id="tag-select-list"
          ref={listRef}
          className="tag-select-dropdown"
          role="listbox"
        >
          {displayOptions.map((tag, idx) => (
            <div
              key={tag}
              id={`tag-opt-${idx}`}
              role="option"
              aria-selected={idx === highlightIndex}
              className={`tag-select-option${idx === highlightIndex ? " highlighted" : ""}${showCreateOption && idx === displayOptions.length - 1 ? " create-option" : ""}`}
              onMouseEnter={() => setHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectTag(tag);
              }}
            >
              {showCreateOption && idx === displayOptions.length - 1 ? (
                <>Create tag: @{tag}</>
              ) : (
                `@${tag}`
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
