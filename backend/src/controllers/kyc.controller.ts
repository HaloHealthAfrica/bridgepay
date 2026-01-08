import type { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/errorHandler";
import { uploadFilesToS3 } from "../services/storage.service";

export async function getMyKyc(req: Request, res: Response) {
  const submission = await prisma.kYCSubmission.findUnique({
    where: { userId: req.user!.userId },
  });

  if (!submission) throw new AppError("KYC submission not found", 404);

  res.json({ success: true, data: { kyc: submission } });
}

export async function submitKyc(req: Request, res: Response) {
  const { idType, idNumber, dateOfBirth, address } = req.body ?? {};

  const files = (req.files as Express.Multer.File[]) || [];
  const urls = await uploadFilesToS3(
    files.map((f) => ({ buffer: f.buffer, originalname: f.originalname, mimetype: f.mimetype })),
    "kyc"
  );

  // Expecting optional uploads with field names: idFront, idBack, selfie.
  // With multer.array we can't preserve fieldnames here; so we store in an array if present.
  const documents: any = { files: urls };

  const updated = await prisma.$transaction(async (tx) => {
    const kyc = await tx.kYCSubmission.upsert({
      where: { userId: req.user!.userId },
      update: {
        status: "PENDING",
        idType: idType || null,
        idNumber: idNumber || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || null,
        documents: documents,
        submittedAt: new Date(),
      },
      create: {
        userId: req.user!.userId,
        status: "PENDING",
        idType: idType || null,
        idNumber: idNumber || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        address: address || null,
        documents: documents,
        submittedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: req.user!.userId },
      data: { kycStatus: "PENDING" },
    });

    await tx.notification.create({
      data: {
        userId: req.user!.userId,
        type: "KYC",
        title: "KYC Submitted",
        message: "Your KYC has been submitted and is pending review.",
        actionUrl: "/settings/kyc",
      },
    });

    return kyc;
  });

  res.json({ success: true, data: { kyc: updated } });
}




