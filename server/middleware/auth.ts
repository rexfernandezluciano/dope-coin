import { Request, Response, NextFunction } from "express";
import { jwtService } from "../services/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwtService.verifyToken(token);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = { id: decoded.userId };
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ message: "Invalid token" });
  }
};
