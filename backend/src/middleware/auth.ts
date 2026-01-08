import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "./errorHandler";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new AppError("Unauthorized", 401);

  const token = header.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as any;
    req.user = { userId: decoded.userId, role: decoded.role, sessionId: decoded.sid };
    next();
  } catch {
    throw new AppError("Unauthorized", 401);
  }
}

export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new AppError("Unauthorized", 401);
    if (!roles.includes(req.user.role)) throw new AppError("Forbidden", 403);
    next();
  };
}


