import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, uniqueSuffix } from './utils/bootstrap';

describe('Auth flow', () => {
  let app: INestApplication;
  let server: any;
  const suffix = uniqueSuffix();
  const slug = `auth-flow-${suffix}`;
  const email = `owner-${suffix}@authflow.com`;
  const password = 'StrongP@ss1';

  beforeAll(async () => {
    app = await bootstrapTestApp();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new tenant + Tenant Admin', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({ tenantName: 'Auth Flow Co', tenantSlug: slug, name: 'Owner', email, password })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.role).toBe('TENANT_ADMIN');
  });

  it('rejects a weak password on registration', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({
        tenantName: 'Weak Co',
        tenantSlug: `weak-${suffix}`,
        name: 'Weak',
        email: `weak-${suffix}@weak.com`,
        password: 'weak',
      })
      .expect(400);
  });

  it('rejects a duplicate tenant slug', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ tenantName: 'Dup', tenantSlug: slug, name: 'Dup', email: `dup-${suffix}@dup.com`, password })
      .expect(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password, tenantSlug: slug })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects invalid credentials', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword1', tenantSlug: slug })
      .expect(401);
  });

  it('rejects unauthenticated access to a protected route', async () => {
    await request(server).get('/api/v1/users/me').expect(401);
  });

  it('refreshes an access token and rotates the refresh token', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password, tenantSlug: slug })
      .expect(200);

    const refreshed = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // The rotated (old) refresh token must no longer be usable.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password, tenantSlug: slug })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});
