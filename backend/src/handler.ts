import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { TodoRepository } from './repository';
import { parseCreateInput, parseUpdateInput, ValidationError } from './types';

function json(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? '' : JSON.stringify(body),
  };
}

export async function route(
  event: APIGatewayProxyEvent,
  repo: TodoRepository,
): Promise<APIGatewayProxyResult> {
  try {
    const userId = event.requestContext?.authorizer?.claims?.sub as string | undefined;
    if (!userId) return json(401, { message: 'unauthorized' });

    const id = event.pathParameters?.id;
    const method = event.httpMethod;
    const body = event.body ? JSON.parse(event.body) : undefined;

    if (method === 'GET' && !id) return json(200, await repo.list(userId));
    if (method === 'POST' && !id) {
      return json(201, await repo.create(userId, parseCreateInput(body)));
    }
    if (method === 'GET' && id) {
      const todo = await repo.get(userId, id);
      return todo ? json(200, todo) : json(404, { message: 'not found' });
    }
    if (method === 'PUT' && id) {
      const todo = await repo.update(userId, id, parseUpdateInput(body));
      return todo ? json(200, todo) : json(404, { message: 'not found' });
    }
    if (method === 'DELETE' && id) {
      const ok = await repo.delete(userId, id);
      return ok ? json(204, null) : json(404, { message: 'not found' });
    }
    return json(405, { message: 'method not allowed' });
  } catch (err) {
    if (err instanceof ValidationError) return json(400, { message: err.message });
    if (err instanceof SyntaxError) return json(400, { message: 'invalid JSON body' });
    console.error(err);
    return json(500, { message: 'internal server error' });
  }
}

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const repo = new TodoRepository(docClient, process.env.TABLE_NAME ?? '');

export const handler: APIGatewayProxyHandler = (event) => route(event, repo);
