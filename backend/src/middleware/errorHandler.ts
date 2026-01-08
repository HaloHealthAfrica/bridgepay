import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { message: "Not found" },
  });
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err?.statusCode && typeof err.statusCode === "number" ? err.statusCode : 500;

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: err?.message || "Internal server error",
    },
  });
}




