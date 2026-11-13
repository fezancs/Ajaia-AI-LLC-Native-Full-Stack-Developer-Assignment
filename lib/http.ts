import { NextResponse } from 'next/server';
import { getCurrentUser } from './auth';
import { AppError } from './errors';
import type { User } from './documents';

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AppError(401, 'Please sign in.');
  return user;
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    /* fall through */
  }
  throw new AppError(400, 'Request body must be a JSON object.');
}

type Ctx = { params: Promise<Record<string, string>> };

/** Wraps a route handler so known errors become clean JSON responses. */
export function route(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}
