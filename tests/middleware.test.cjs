const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');

const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
process.env.JWT_PRIVATE_KEY_B64 = Buffer.from(pair.privateKey).toString('base64');
process.env.JWT_PUBLIC_KEY_B64 = Buffer.from(pair.publicKey).toString('base64');
const { requireAuth, requireAdmin, requireCredit, validateUuidParam, errorHandler } = require('../dist/middleware/http.js');
const { InvalidMediaFileError } = require('../dist/services/asset-service.js');
const { User } = require('../dist/models/index.js');

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('authentication and authorization middleware', () => {
  test('rejects a request without a Bearer token', () => {
    const req = { header: () => undefined };
    const res = responseMock();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a valid RS256 token and attaches only identity metadata', () => {
    const token = jwt.sign(
      { email: 'demo@example.com', role: 'user' },
      pair.privateKey,
      { algorithm: 'RS256', issuer: 'vision-inference-platform', subject: 'user-123', expiresIn: '1h' },
    );
    const req = { header: () => `Bearer ${token}` };
    const res = responseMock();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toEqual({ id: 'user-123', email: 'demo@example.com', role: 'user' });
  });

  test('allows the admin role and rejects a regular user', () => {
    const res = responseMock();
    const next = jest.fn();
    requireAdmin({ auth: { id: 'admin-1', email: 'admin@example.com', role: 'admin' } }, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    const deniedNext = jest.fn();
    requireAdmin({ auth: { id: 'user-1', email: 'demo@example.com', role: 'user' } }, res, deniedNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(deniedNext).not.toHaveBeenCalled();
  });

  test('rejects malformed UUID route parameters with a client error', () => {
    const req = {};
    const res = responseMock();
    const next = jest.fn();

    validateUuidParam(req, res, next, 'not-a-uuid', 'datasetId');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('maps invalid media exceptions to a 400 response', () => {
    const res = responseMock();
    errorHandler(new InvalidMediaFileError('Invalid image data.'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid image data.' });
  });

  test('preserves client HTTP errors such as oversized JSON bodies', () => {
    const res = responseMock();
    const error = Object.assign(new Error('Payload too large.'), { status: 413 });

    errorHandler(error, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({ error: 'Payload too large.' });
  });
});

describe('credit middleware', () => {
  afterEach(() => jest.restoreAllMocks());

  test('rejects an account with zero credits with HTTP 401', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 'user-123', creditBalance: 0 });
    const req = { auth: { id: 'user-123' } };
    const res = responseMock();
    const next = jest.fn();

    await requireCredit(req, res, next);

    expect(User.findByPk).toHaveBeenCalledWith('user-123', { attributes: ['id', 'creditBalance'] });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'User credit is exhausted.' });
    expect(next).not.toHaveBeenCalled();
  });

  test('allows an account with positive credits', async () => {
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 'user-123', creditBalance: 0.25 });
    const req = { auth: { id: 'user-123' } };
    const res = responseMock();
    const next = jest.fn();

    await requireCredit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
