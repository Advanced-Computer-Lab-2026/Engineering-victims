const jwt = require('jsonwebtoken');

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
};

module.exports.authenticate = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Restricts a route to the given roles. Must run after authenticate.
 *
 * Returns 403 rather than 401 for an authenticated user with the wrong role:
 * the session is valid, they simply may not do this.
 */
module.exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `This action is restricted to: ${roles.join(', ')}.`,
    });
  }
  next();
};

module.exports.requireAuth = module.exports.authenticate;
module.exports.default = module.exports.authenticate;

