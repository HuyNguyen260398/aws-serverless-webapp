import type { Todo } from '@/lib/api';
import { TodoItem } from './TodoItem';

interface TodoListProps {
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo, title: string) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoList({ todos, onToggle, onEdit, onDelete }: TodoListProps) {
  return (
    <ul className="mt-4">
      {todos.map((todo) => (
        <TodoItem
          key={todo.todoId}
          todo={todo}
          onToggle={onToggle}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
