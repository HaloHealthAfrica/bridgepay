import type { NextFunction, Request, Response } from "express";

export const asyncHandler =
  <TReq extends Request = Request>(
    fn: (req: TReq, res: Response, next: NextFunction) => Promise<any> | any
  ) =>
  (req: TReq, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };


