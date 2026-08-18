import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { bootstrapTestApp, uniqueSuffix } from './utils/bootstrap';

describe('Tenant isolation (mandatory cross-tenant security test)', () => {
  let app: INestApplication;
  let server: any;

  let tokenA: string;
  let tokenB: string;
  let projectAId: string;
  let taskAId: string;
  let userAId: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
    server = app.getHttpServer();

    const suffix = uniqueSuffix();

    const regA = await request(server)
      .post('/api/v1/auth/register')
      .send({
        tenantName: `Tenant A ${suffix}`,
        tenantSlug: `tenant-a-${suffix}`,
        name: 'Alice Admin',
        email: `alice-${suffix}@tenanta.com`,
        password: 'StrongP@ss1',
      })
      .expect(201);
    tokenA = regA.body.accessToken;
    userAId = regA.body.user.id;

    const regB = await request(server)
      .post('/api/v1/auth/register')
      .send({
        tenantName: `Tenant B ${suffix}`,
        tenantSlug: `tenant-b-${suffix}`,
        name: 'Bob Admin',
        email: `bob-${suffix}@tenantb.com`,
        password: 'StrongP@ss1',
      })
      .expect(201);
    tokenB = regB.body.accessToken;

    const project = await request(server)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Tenant A Secret Project' })
      .expect(201);
    projectAId = project.body.id;

    const task = await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Tenant A Secret Task', projectId: projectAId })
      .expect(201);
    taskAId = task.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows Tenant A to read its own project', async () => {
    await request(server)
      .get(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  });

  it('denies Tenant B from reading Tenant A project (404, not leaked as 403)', async () => {
    await request(server)
      .get(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('denies Tenant B from updating Tenant A project', async () => {
    await request(server)
      .patch(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it('denies Tenant B from deleting Tenant A project', async () => {
    await request(server)
      .delete(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it("Tenant B's project list never includes Tenant A's project", async () => {
    const res = await request(server)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).not.toContain(projectAId);
  });

  it('denies Tenant B from reading Tenant A task', async () => {
    await request(server).get(`/api/v1/tasks/${taskAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });

  it('denies Tenant B from reading a Tenant A user', async () => {
    await request(server).get(`/api/v1/users/${userAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });

  it('ignores a client-supplied tenant header/body and still scopes to the JWT tenant', async () => {
    // Even if a malicious client tries to smuggle another tenant's id in the body,
    // the service layer only ever trusts requireTenantId(JWT) — extra fields are
    // stripped by the whitelist ValidationPipe, so this must still 404.
    await request(server)
      .get(`/api/v1/projects/${projectAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .set('x-tenant-id', 'tenant-a')
      .expect(404);
  });
});
