import type { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import speakeasy from "speakeasy";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";

function parseExpiryMs(value: string, fallbackMs: number) {
  const v = String(value || "").trim();
  const match = v.match(/^(\d+)\s*([smhd])$/i);
  if (!match) return fallbackMs;
  const n = Number(match[1]);
  const unit = (match[2] ?? "d").toLowerCase();
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function generateTokens(userId: string, role: string, sessionId: string, refreshJti: string) {
  type ExpiresIn = Exclude<jwt.SignOptions["expiresIn"], undefined>;
  const accessExpiry = (process.env.JWT_ACCESS_EXPIRY || "15m") as ExpiresIn;
  const refreshExpiry = (process.env.JWT_REFRESH_EXPIRY || "7d") as ExpiresIn;

  const accessToken = jwt.sign({ userId, role, sid: sessionId }, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: accessExpiry,
  });

  const refreshToken = jwt.sign({ userId, role, sid: sessionId, jti: refreshJti }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: refreshExpiry,
  });

  return { accessToken, refreshToken };
}

export async function register(req: Request, res: Response) {
  const { email, phone, password, name, role } = req.body ?? {};

  if (!email || !phone || !password || !name) throw new AppError("All fields required", 400);

  // Enforce public registration roles (defense-in-depth; validation also restricts this).
  const publicRoles = new Set<UserRole>(["CUSTOMER", "MERCHANT", "IMPLEMENTER"]);
  const safeRole: UserRole = role && publicRoles.has(role as UserRole) ? (role as UserRole) : "CUSTOMER";

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
    select: { id: true },
  });
  if (existing) throw new AppError("User already exists", 400);

  const hashedPassword = await bcrypt.hash(String(password), 10);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email,
        phone,
        password: hashedPassword,
        name,
        role: safeRole,
      },
    });

    await tx.wallet.create({ data: { userId: newUser.id } });
    await tx.kYCSubmission.create({ data: { userId: newUser.id } });

    if (newUser.role === "IMPLEMENTER") {
      await tx.userProfile.create({ data: { userId: newUser.id, skills: [], languages: [] } });
    }

    if (newUser.role === "MERCHANT") {
      await tx.merchantProfile.create({
        data: { userId: newUser.id, businessName: name, paymentMethods: ["MPESA", "CARD"] },
      });
    }

    return newUser;
  });

  const sessionId = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const refreshMs = parseExpiryMs(String(process.env.JWT_REFRESH_EXPIRY || "7d"), 7 * 24 * 60 * 60 * 1000);
  const refreshTokenPreview = generateTokens(user.id, user.role, sessionId, refreshJti).refreshToken;
  const refreshTokenHash = sha256Hex(refreshTokenPreview);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      deviceInfo: (req.headers["user-agent"] as string) || "Unknown",
      ipAddress: req.ip ?? null,
      expiresAt: new Date(Date.now() + refreshMs),
      refreshTokenHash,
      refreshTokenJti: refreshJti,
      lastActive: new Date(),
    },
  });

  // Re-issue tokens (same inputs) for response
  const { accessToken, refreshToken } = generateTokens(user.id, user.role, sessionId, refreshJti);

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        kycStatus: user.kycStatus,
      },
      accessToken,
      refreshToken,
    },
  });
}

export async function login(req: Request, res: Response) {
  const { email, password, twoFactorCode } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { email }, include: { merchantProfile: true } });
  if (!user) throw new AppError("Invalid credentials", 401);
  if (user.status !== "ACTIVE") throw new AppError("Account suspended", 403);

  const isValidPassword = await bcrypt.compare(String(password), user.password);
  if (!isValidPassword) throw new AppError("Invalid credentials", 401);

  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      return res.json({ success: true, requiresTwoFactor: true });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token: String(twoFactorCode),
    });
    if (!verified) throw new AppError("Invalid 2FA code", 401);
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const sessionId = crypto.randomUUID();
  const refreshJti = crypto.randomUUID();
  const refreshMs = parseExpiryMs(String(process.env.JWT_REFRESH_EXPIRY || "7d"), 7 * 24 * 60 * 60 * 1000);
  const refreshTokenPreview = generateTokens(user.id, user.role, sessionId, refreshJti).refreshToken;
  const refreshTokenHash = sha256Hex(refreshTokenPreview);

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      deviceInfo: (req.headers["user-agent"] as string) || "Unknown",
      ipAddress: req.ip ?? null,
      expiresAt: new Date(Date.now() + refreshMs),
      refreshTokenHash,
      refreshTokenJti: refreshJti,
      lastActive: new Date(),
    },
  });

  const { accessToken, refreshToken } = generateTokens(user.id, user.role, sessionId, refreshJti);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
        kycStatus: user.kycStatus,
        twoFactorEnabled: user.twoFactorEnabled,
      },
      accessToken,
      refreshToken,
    },
  });
}

export async function getMe(req: Request, res: Response) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      phone: true,
      name: true,
      role: true,
      kycStatus: true,
      status: true,
      twoFactorEnabled: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new AppError("Unauthorized", 401);
  res.json({ success: true, data: { user } });
}

export async function refreshToken(req: Request, res: Response) {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) throw new AppError("Refresh token required", 400);

  try {
    const decoded = jwt.verify(String(refreshToken), process.env.JWT_REFRESH_SECRET!) as any;
    const userId = String(decoded.userId || "");
    const role = String(decoded.role || "");
    const sid = String(decoded.sid || "");
    if (!userId || !sid) throw new AppError("Invalid refresh token", 401);

    const session = await prisma.session.findUnique({ where: { id: sid } });
    if (!session || session.userId !== userId) throw new AppError("Invalid refresh token", 401);
    if (session.revokedAt) throw new AppError("Session revoked", 401);
    if (session.expiresAt.getTime() <= Date.now()) throw new AppError("Session expired", 401);
    if (!session.refreshTokenHash) throw new AppError("Invalid refresh token", 401);

    const providedHash = sha256Hex(String(refreshToken));
    if (providedHash !== session.refreshTokenHash) throw new AppError("Invalid refresh token", 401);

    // Rotate refresh token in-place for this session
    const newJti = crypto.randomUUID();
    const refreshMs = parseExpiryMs(String(process.env.JWT_REFRESH_EXPIRY || "7d"), 7 * 24 * 60 * 60 * 1000);
    const { accessToken, refreshToken: newRefresh } = generateTokens(userId, role, sid, newJti);

    await prisma.session.update({
      where: { id: sid },
      data: {
        refreshTokenHash: sha256Hex(newRefresh),
        refreshTokenJti: newJti,
        lastActive: new Date(),
        expiresAt: new Date(Date.now() + refreshMs),
      },
    });

    res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
  } catch {
    throw new AppError("Invalid refresh token", 401);
  }
}

export async function logout(req: Request, res: Response) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  const sid = req.user.sessionId;
  if (!sid) {
    // Backward compatible fallback: revoke all if we can't identify a session
    await prisma.session.updateMany({
      where: { userId: req.user.userId, revokedAt: null },
      data: { revokedAt: new Date(), refreshTokenHash: null, refreshTokenJti: null },
    });
    return res.json({ success: true });
  }

  await prisma.session.updateMany({
    where: { id: sid, userId: req.user.userId },
    data: { revokedAt: new Date(), refreshTokenHash: null, refreshTokenJti: null },
  });
  res.json({ success: true });
}

export async function logoutAll(req: Request, res: Response) {
  if (!req.user) throw new AppError("Unauthorized", 401);
  await prisma.session.updateMany({
    where: { userId: req.user.userId, revokedAt: null },
    data: { revokedAt: new Date(), refreshTokenHash: null, refreshTokenJti: null },
  });
  res.json({ success: true });
}


