import { describe, it, expect, afterEach } from 'vitest';
import { requireAuth } from './auth';
import type { NextRequest } from 'next/server';

const req = (authorization?: string) =>
  ({ headers: new Headers(authorization ? { authorization } : {}) }) as NextRequest;

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('requireAuth', () => {
  it('accepts API_TOKEN, as before', () => {
    process.env.API_TOKEN = 'primary-token';
    delete process.env.API_TOKEN_FLYWHEEL;
    expect(requireAuth(req('Bearer primary-token'))).toBeNull();
  });

  it('still rejects a wrong token when only API_TOKEN is set', () => {
    process.env.API_TOKEN = 'primary-token';
    delete process.env.API_TOKEN_FLYWHEEL;
    expect(requireAuth(req('Bearer nope'))?.status).toBe(401);
    expect(requireAuth(req())?.status).toBe(401);
  });

  it('still 503s when no token is configured', () => {
    delete process.env.API_TOKEN;
    delete process.env.API_TOKEN_FLYWHEEL;
    expect(requireAuth(req('Bearer anything'))?.status).toBe(503);
  });

  it('accepts either token when both are set', () => {
    process.env.API_TOKEN = 'primary-token';
    process.env.API_TOKEN_FLYWHEEL = 'flywheel-token';
    expect(requireAuth(req('Bearer primary-token'))).toBeNull();
    expect(requireAuth(req('Bearer flywheel-token'))).toBeNull();
    expect(requireAuth(req('Bearer neither'))?.status).toBe(401);
  });

  it('revoking one token does not affect the other', () => {
    process.env.API_TOKEN = 'primary-token';
    delete process.env.API_TOKEN_FLYWHEEL;
    expect(requireAuth(req('Bearer flywheel-token'))?.status).toBe(401);
    expect(requireAuth(req('Bearer primary-token'))).toBeNull();
  });

  it('does not accept a token of a different length', () => {
    process.env.API_TOKEN = 'primary-token';
    expect(requireAuth(req('Bearer primary-token-longer'))?.status).toBe(401);
    expect(requireAuth(req('Bearer primary'))?.status).toBe(401);
  });
});
