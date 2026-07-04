'use client';

import { useState, type KeyboardEvent } from 'react';
import type { Todo } from '@/lib/api';

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoItem({ todo, onToggle, onEdit, onDelete }: TodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.title);

  function startEditing() {
    setDraft(todo.title);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== todo.title) {
      onEdit(todo, trimmed);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') {
      setDraft(todo.title);
      setEditing(false);
    }
  }

  return (
    <li className="flex items-center gap-3 border-b border-gray-100 py-3 last:border-0 dark:border-gray-800">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        aria-label={
          todo.completed ? `Mark "${todo.title}" as not completed` : `Mark "${todo.title}" as completed`
        }
        className="h-5 w-5 shrink-0 rounded border-gray-300 text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-gray-600"
      />
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="flex-1 rounded border border-indigo-300 bg-white px-2 py-1 text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:border-indigo-600 dark:bg-gray-800 dark:text-gray-100"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className={`flex-1 truncate text-left text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-100 ${
            todo.completed ? 'text-gray-400 line-through dark:text-gray-500' : ''
          }`}
        >
          {todo.title}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDelete(todo)}
        aria-label={`Delete "${todo.title}"`}
        className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:hover:bg-red-950"
      >
        ✕
      </button>
    </li>
  );
}
