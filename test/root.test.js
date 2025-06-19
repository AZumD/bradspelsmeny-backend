process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/testdb';

const request = require('supertest');
const { app } = require('../index');

describe('GET /', () => {
  it('should return status message', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('🎲 Board Game Backend API is running.');
  });
});
