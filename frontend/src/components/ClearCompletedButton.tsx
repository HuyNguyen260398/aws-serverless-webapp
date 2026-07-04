interface ClearCompletedButtonProps {
  count: number;
  onClear: () => void;
}

export function ClearCompletedButton({ count, onClear }: ClearCompletedButtonProps) {
  return (
    <div className="mt-4 text-right">
      <button
        type="button"
        onClick={onClear}
        className="text-sm text-gray-500 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-400 dark:hover:text-red-400"
      >
        Clear completed ({count})
      </button>
    </div>
  );
}
