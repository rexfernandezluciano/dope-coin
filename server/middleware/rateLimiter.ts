import { Request, Response, NextFunction } from "express";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100; // requests per window

export const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  
  // Clean up expired entries
  Object.keys(store).forEach(k => {
    if (store[k].resetTime < now) {
      delete store[k];
    }
  });

  if (!store[key]) {
    store[key] = {
      count: 1,
      resetTime: now + WINDOW_MS,
    };
    return next();
  }

  if (store[key].resetTime < now) {
    store[key] = {
      count: 1,
      resetTime: now + WINDOW_MS,
    };
    return next();
  }

  store[key].count++;

  if (store[key].count > MAX_REQUESTS) {
    return res.status(429).json({
      message: "Too many requests",
      retryAfter: Math.ceil((store[key].resetTime - now) / 1000),
    });
  }

  next();
};
