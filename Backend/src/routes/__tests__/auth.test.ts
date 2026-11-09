import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../lib/prisma.ts';
import { app, createFixture, PHONE, requestCode, signIn } from './fixtures.ts';

beforeEach(createFixture);

describe('OTP sign-in', () => {
  it('signs in with the right code and sets an HttpOnly cookie', async () => {
    const agent = request.agent(app);
    const code = await requestCode(agent, PHONE.shopA);
    const res = await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code }).expect(204);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/SameSite=Lax/);

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({ role: 'RETAILER', retailer: { shopName: 'Shop A' } });
  });

  it('never returns the code outside demo mode', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ phone: PHONE.shopA }).expect(200);
    expect(res.body).toEqual({});
  });

  it('stores the code only as a hash', async () => {
    const code = await requestCode(request.agent(app), PHONE.shopA);
    const challenge = await prisma.otpChallenge.findFirstOrThrow();
    expect(challenge.codeHash).not.toContain(code);
  });

  it('rejects a wrong code', async () => {
    const agent = request.agent(app);
    const code = await requestCode(agent, PHONE.shopA);
    const wrong = code === '123456' ? '654321' : '123456';
    const res = await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code: wrong }).expect(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });

  it('locks a code after five wrong attempts, even if the sixth is right', async () => {
    const agent = request.agent(app);
    const code = await requestCode(agent, PHONE.shopA);
    const wrong = code === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) {
      await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code: wrong }).expect(400);
    }
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code }).expect(400);
  });

  it('allows a code to be used only once', async () => {
    const agent = request.agent(app);
    const code = await requestCode(agent, PHONE.shopA);
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code }).expect(204);
    await request(app).post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code }).expect(400);
  });

  it('rejects an expired code', async () => {
    const agent = request.agent(app);
    const code = await requestCode(agent, PHONE.shopA);
    await prisma.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.post('/api/auth/otp/verify').send({ phone: PHONE.shopA, code }).expect(400);
  });

  it('answers the same for an unknown number, and creates nothing', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ phone: PHONE.unknown }).expect(200);
    expect(res.body).toEqual({});
    expect(await prisma.otpChallenge.count()).toBe(0);
  });

  it('rejects a malformed phone number', async () => {
    await request(app).post('/api/auth/otp/request').send({ phone: '12345' }).expect(400);
  });

  it('ends the session on sign out', async () => {
    const agent = await signIn(PHONE.shopA);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('does not accept an expired session', async () => {
    const agent = await signIn(PHONE.shopA);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await agent.get('/api/auth/me').expect(401);
  });
});

describe('malformed requests', () => {
  it('rejects broken JSON cleanly', async () => {
    const res = await request(app)
      .post('/api/auth/otp/request')
      .set('Content-Type', 'application/json')
      .send('{not json')
      .expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('returns JSON for an unknown API route', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
