import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import { Todo, CreateTodoInput, UpdateTodoInput } from './types';

export class TodoRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async list(userId: string): Promise<Todo[]> {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
      }),
    );
    return (res.Items ?? []) as Todo[];
  }

  async get(userId: string, todoId: string): Promise<Todo | null> {
    const res = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { userId, todoId } }),
    );
    return (res.Item as Todo | undefined) ?? null;
  }

  async create(userId: string, input: CreateTodoInput): Promise<Todo> {
    const now = new Date().toISOString();
    const todo: Todo = {
      userId,
      todoId: ulid(),
      title: input.title,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await this.client.send(
      new PutCommand({ TableName: this.tableName, Item: todo }),
    );
    return todo;
  }

  async update(
    userId: string,
    todoId: string,
    input: UpdateTodoInput,
  ): Promise<Todo | null> {
    const sets = ['updatedAt = :now'];
    const values: Record<string, unknown> = { ':now': new Date().toISOString() };
    const names: Record<string, string> = {};
    if (input.title !== undefined) {
      sets.push('#title = :title');
      names['#title'] = 'title';
      values[':title'] = input.title;
    }
    if (input.completed !== undefined) {
      sets.push('completed = :completed');
      values[':completed'] = input.completed;
    }
    try {
      const res = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { userId, todoId },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeValues: values,
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
          ConditionExpression: 'attribute_exists(todoId)',
          ReturnValues: 'ALL_NEW',
        }),
      );
      return (res.Attributes as Todo | undefined) ?? null;
    } catch (err) {
      if ((err as Error).name === 'ConditionalCheckFailedException') return null;
      throw err;
    }
  }

  async delete(userId: string, todoId: string): Promise<boolean> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { userId, todoId },
          ConditionExpression: 'attribute_exists(todoId)',
        }),
      );
      return true;
    } catch (err) {
      if ((err as Error).name === 'ConditionalCheckFailedException') return false;
      throw err;
    }
  }
}
