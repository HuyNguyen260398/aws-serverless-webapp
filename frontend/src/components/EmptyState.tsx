interface EmptyStateProps {
  hasAnyTodos: boolean;
}

export function EmptyState({ hasAnyTodos }: EmptyStateProps) {
  return (
    <p className="mt-8 text-center text-gray-400 dark:text-gray-500">
      {hasAnyTodos ? 'No todos match this filter.' : 'No todos yet — add your first one above.'}
    </p>
  );
}
