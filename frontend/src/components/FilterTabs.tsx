export type Filter = 'all' | 'active' | 'completed';

interface FilterTabsProps {
  filter: Filter;
  onChange: (filter: Filter) => void;
  allCount: number;
  activeCount: number;
  completedCount: number;
}

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export function FilterTabs({
  filter,
  onChange,
  allCount,
  activeCount,
  completedCount,
}: FilterTabsProps) {
  const counts: Record<Filter, number> = {
    all: allCount,
    active: activeCount,
    completed: completedCount,
  };

  return (
    <div className="mt-4 flex gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-800" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={filter === tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 ${
            filter === tab.key
              ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-50'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
          }`}
        >
          {tab.label} ({counts[tab.key]})
        </button>
      ))}
    </div>
  );
}
