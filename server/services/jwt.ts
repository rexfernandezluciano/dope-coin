import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = "7d";

export class JWTService {
  generateToken(userId: string): string {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  verifyToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
      return decoded;
    } catch (error) {
      return null;
    }
  }
}

export const jwtService = new JWTService();
