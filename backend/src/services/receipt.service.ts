import PDFDocument from "pdfkit";
import AWS from "aws-sdk";
import { prisma } from "../lib/prisma";

const hasS3 =
  !!process.env.AWS_ACCESS_KEY_ID &&
  !!process.env.AWS_SECRET_ACCESS_KEY &&
  !!process.env.AWS_S3_BUCKET &&
  !!process.env.AWS_REGION;

const s3 = hasS3
  ? new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      region: process.env.AWS_REGION!,
    })
  : null;

export async function generateReceipt(transactionId: string): Promise<string> {
  if (!s3) throw new Error("S3 not configured");

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      fromUser: { select: { name: true, email: true, phone: true } },
      toUser: { select: { name: true, email: true, phone: true } },
    },
  });

  if (!transaction) throw new Error("Transaction not found");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const key = `receipts/${transactionId}.pdf`;

      try {
        await s3
          .putObject({
            Bucket: process.env.AWS_S3_BUCKET!,
            Key: key,
            Body: pdfBuffer,
            ContentType: "application/pdf",
          })
          .promise();

        const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        await prisma.transaction.update({
          where: { id: transactionId },
          data: { receiptUrl: url },
        });

        resolve(url);
      } catch (error) {
        reject(error);
      }
    });

    doc.fontSize(20).text("BRIDGE", { align: "center" });
    doc.fontSize(14).text("Transaction Receipt", { align: "center" });
    doc.moveDown();

    doc.fontSize(10).text(`Reference: ${transaction.reference}`);
    doc.text(`Date: ${transaction.createdAt.toLocaleString()}`);
    doc.text(`Type: ${transaction.type}`);
    doc.text(`Status: ${transaction.status}`);
    doc.moveDown();

    if (transaction.fromUser) {
      doc.text("From:", { underline: true });
      doc.text(`  ${transaction.fromUser.name}`);
      doc.text(`  ${transaction.fromUser.phone}`);
      doc.moveDown();
    }

    if (transaction.toUser) {
      doc.text("To:", { underline: true });
      doc.text(`  ${transaction.toUser.name}`);
      doc.text(`  ${transaction.toUser.phone}`);
      doc.moveDown();
    }

    doc.fontSize(12).text(`Amount: KES ${transaction.amount}`);
    if (Number(transaction.fee) > 0) {
      doc.text(`Fee: KES ${transaction.fee}`);
      doc.text(`Total: KES ${Number(transaction.amount) + Number(transaction.fee)}`);
    }

    doc.moveDown();
    doc.fontSize(8).text("Thank you for using Bridge", { align: "center" });

    doc.end();
  });
}




