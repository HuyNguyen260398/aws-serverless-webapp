'use client';

import { useState, type FormEvent } from 'react';

interface TodoFormProps {
  onAdd: (title: string) => void | Promise<void>;
}

export function TodoForm({ onAdd }: TodoFormProps) {
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        disabled={submitting}
        className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
