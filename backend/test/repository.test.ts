import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { TodoRepository } from '../src/repository';

const ddb = mockClient(DynamoDBDocumentClient);
const repo = new TodoRepository(ddb as unknown as DynamoDBDocumentClient, 'todos');

beforeEach(() => ddb.reset());

describe('TodoRepository', () => {
  it('list queries by userId', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ userId: 'u1', todoId: 't1' }] });
    const result = await repo.list('u1');
    expect(result).toHaveLength(1);
    const call = ddb.commandCalls(QueryCommand)[0].args[0].input;
    expect(call.ExpressionAttributeValues).toEqual({ ':u': 'u1' });
  });

  it('create writes an item with generated id and timestamps', async () => {
    ddb.on(PutCommand).resolves({});
    const todo = await repo.create('u1', { title: 'buy milk' });
    expect(todo.userId).toBe('u1');
    expect(todo.title).toBe('buy milk');
    expect(todo.completed).toBe(false);
    expect(todo.todoId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/); // ULID
    expect(todo.createdAt).toBe(todo.updatedAt);
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toEqual(todo);
  });

  it('get returns null when item absent', async () => {
    ddb.on(GetCommand).resolves({});
    expect(await repo.get('u1', 'missing')).toBeNull();
  });

  it('update returns null when condition fails', async () => {
    const err = new Error('nope');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(UpdateCommand).rejects(err);
    expect(await repo.update('u1', 'missing', { completed: true })).toBeNull();
  });

  it('update returns the new item', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { userId: 'u1', todoId: 't1', completed: true } });
    const result = await repo.update('u1', 't1', { completed: true });
    expect(result?.completed).toBe(true);
    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ userId: 'u1', todoId: 't1' });
    expect(input.ConditionExpression).toContain('attribute_exists');
  });

  it('delete returns false when condition fails', async () => {
    const err = new Error('nope');
    err.name = 'ConditionalCheckFailedException';
    ddb.on(DeleteCommand).rejects(err);
    expect(await repo.delete('u1', 'missing')).toBe(false);
  });

  it('delete returns true on success', async () => {
    ddb.on(DeleteCommand).resolves({});
    expect(await repo.delete('u1', 't1')).toBe(true);
  });
});
