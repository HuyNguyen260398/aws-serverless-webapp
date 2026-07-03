import type { APIGatewayProxyEvent } from 'aws-lambda';
import { route } from '../src/handler';
import { TodoRepository } from '../src/repository';

function fakeRepo(overrides: Partial<TodoRepository>): TodoRepository {
  return overrides as unknown as TodoRepository;
}

function event(partial: Partial<APIGatewayProxyEvent>): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    pathParameters: null,
    body: null,
    requestContext: { authorizer: { claims: { sub: 'u1' } } },
    ...partial,
  } as unknown as APIGatewayProxyEvent;
}

describe('route', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const res = await route(
      event({ requestContext: {} as never }),
      fakeRepo({}),
    );
    expect(res.statusCode).toBe(401);
  });

  it('GET /todos lists the caller\'s todos', async () => {
    const list = jest.fn().mockResolvedValue([{ todoId: 't1' }]);
    const res = await route(event({ httpMethod: 'GET' }), fakeRepo({ list }));
    expect(list).toHaveBeenCalledWith('u1');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([{ todoId: 't1' }]);
  });

  it('POST /todos creates and returns 201', async () => {
    const create = jest.fn().mockResolvedValue({ todoId: 't2', title: 'x' });
    const res = await route(
      event({ httpMethod: 'POST', body: JSON.stringify({ title: 'x' }) }),
      fakeRepo({ create }),
    );
    expect(create).toHaveBeenCalledWith('u1', { title: 'x' });
    expect(res.statusCode).toBe(201);
  });

  it('POST with invalid body returns 400', async () => {
    const res = await route(
      event({ httpMethod: 'POST', body: JSON.stringify({}) }),
      fakeRepo({ create: jest.fn() }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST with malformed JSON returns 400', async () => {
    const res = await route(
      event({ httpMethod: 'POST', body: '{not json' }),
      fakeRepo({ create: jest.fn() }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET /todos/{id} returns 404 when missing', async () => {
    const get = jest.fn().mockResolvedValue(null);
    const res = await route(
      event({ httpMethod: 'GET', pathParameters: { id: 't9' } }),
      fakeRepo({ get }),
    );
    expect(get).toHaveBeenCalledWith('u1', 't9');
    expect(res.statusCode).toBe(404);
  });

  it('PUT /todos/{id} updates and returns 200', async () => {
    const update = jest.fn().mockResolvedValue({ todoId: 't1', completed: true });
    const res = await route(
      event({ httpMethod: 'PUT', pathParameters: { id: 't1' }, body: JSON.stringify({ completed: true }) }),
      fakeRepo({ update }),
    );
    expect(update).toHaveBeenCalledWith('u1', 't1', { completed: true });
    expect(res.statusCode).toBe(200);
  });

  it('DELETE /todos/{id} returns 204 with empty body', async () => {
    const del = jest.fn().mockResolvedValue(true);
    const res = await route(
      event({ httpMethod: 'DELETE', pathParameters: { id: 't1' } }),
      fakeRepo({ delete: del }),
    );
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
  });

  it('DELETE missing item returns 404', async () => {
    const del = jest.fn().mockResolvedValue(false);
    const res = await route(
      event({ httpMethod: 'DELETE', pathParameters: { id: 't9' } }),
      fakeRepo({ delete: del }),
    );
    expect(res.statusCode).toBe(404);
  });
});
