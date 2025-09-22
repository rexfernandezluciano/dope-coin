
import { Request, Response, NextFunction } from "express";
import { walletService } from "../services/wallet.js";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    secretKey?: string;
  };
  secretKey?: string;
}

export const walletAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pin } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    if (!pin) {
      return res.status(400).json({ message: "PIN required for wallet operations" });
    }

    // Generate session password from PIN
    const sessionPassword = walletService.generateSessionPassword(userId, pin);
    
    // Retrieve secret key
    const secretKey = await walletService.getUserSecretKey(userId, sessionPassword);
    
    // Attach secret key to request
    req.secretKey = secretKey;
    
    next();
  } catch (error) {
    console.error("Wallet authentication error:", error);
    res.status(401).json({ 
      message: error instanceof Error ? error.message : "Wallet authentication failed" 
    });
  }
};

// Middleware for operations that require wallet session but not PIN
export const walletSessionMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { sessionKey } = req.headers;

    if (!userId || !sessionKey) {
      return res.status(401).json({ message: "Wallet session required" });
    }

    // For read-only operations, we can use a cached session
    // This would need to be implemented based on your session management
    next();
  } catch (error) {
    console.error("Wallet session error:", error);
    res.status(401).json({ message: "Invalid wallet session" });
  }
};
