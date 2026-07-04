import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  signOutLabel?: string;
  onSignOut: () => void;
  completedCount: number;
  totalCount: number;
}

export function Header({ signOutLabel, onSignOut, completedCount, totalCount }: HeaderProps) {
  const progress = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <header className="mb-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Todos</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Sign out{signOutLabel ? ` (${signOutLabel})` : ''}
          </button>
        </div>
      </div>

      {totalCount > 0 && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {completedCount} of {totalCount} done
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
