import "dotenv/config";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function money(n: number) {
  return new Prisma.Decimal(n);
}

async function upsertUser(args: {
  email: string;
  phone: string;
  name: string;
  role:
    | "CUSTOMER"
    | "MERCHANT"
    | "IMPLEMENTER"
    | "PROJECT_VERIFIER"
    | "KYC_VERIFIER"
    | "ADMIN";
  kycStatus?: "INCOMPLETE" | "PENDING" | "VERIFIED" | "REJECTED";
  passwordHash: string;
}) {
  return prisma.user.upsert({
    where: { email: args.email },
    update: {
      phone: args.phone,
      name: args.name,
      role: args.role,
      kycStatus: args.kycStatus ?? "INCOMPLETE",
      password: args.passwordHash,
      status: "ACTIVE",
    },
    create: {
      email: args.email,
      phone: args.phone,
      name: args.name,
      role: args.role,
      kycStatus: args.kycStatus ?? "INCOMPLETE",
      password: args.passwordHash,
      status: "ACTIVE",
    },
  });
}

async function upsertWallet(userId: string, data: { balance: number; pendingBalance?: number; escrowBalance?: number; currency?: string }) {
  return prisma.wallet.upsert({
    where: { userId },
    update: {
      balance: money(data.balance),
      pendingBalance: money(data.pendingBalance ?? 0),
      escrowBalance: money(data.escrowBalance ?? 0),
      currency: data.currency ?? "KES",
    },
    create: {
      userId,
      balance: money(data.balance),
      pendingBalance: money(data.pendingBalance ?? 0),
      escrowBalance: money(data.escrowBalance ?? 0),
      currency: data.currency ?? "KES",
    },
  });
}

async function seedFeeSchedules(adminId: string) {
  const schedules = [
    {
      name: "Wallet transfer (P2P) - free",
      flow: "WALLET_TRANSFER" as const,
      method: "WALLET",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 0,
      flat: 0,
      minFee: 0,
      maxFee: null,
    },
    {
      name: "Merchant QR pay (wallet) - 0.5%",
      flow: "MERCHANT_QR_PAY" as const,
      method: "QR_WALLET",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 50,
      flat: 0,
      minFee: 0,
      maxFee: 100,
    },
    {
      name: "Withdrawal (M-Pesa B2C) - 1% capped 50",
      flow: "WALLET_WITHDRAWAL" as const,
      method: "MPESA_B2C",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 100,
      flat: 0,
      minFee: 0,
      maxFee: 50,
    },
    {
      name: "Send money (M-Pesa B2C) - 1% capped 50",
      flow: "WALLET_SEND_MPESA" as const,
      method: "MPESA_B2C",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 100,
      flat: 0,
      minFee: 0,
      maxFee: 50,
    },
    {
      name: "Withdrawal (Bank A2P) - 1% min 20 max 200",
      flow: "WALLET_WITHDRAWAL" as const,
      method: "BANK_A2P",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 100,
      flat: 0,
      minFee: 20,
      maxFee: 200,
    },
    {
      name: "Deposit (Paybill) - 1% capped 30 (credited net)",
      flow: "WALLET_DEPOSIT" as const,
      method: "PAYBILL",
      currency: "KES",
      feePayer: "RECEIVER" as const,
      bps: 100,
      flat: 0,
      minFee: 0,
      maxFee: 30,
    },
    {
      name: "Project fund (wallet) - free",
      flow: "PROJECT_FUND_WALLET" as const,
      method: "WALLET",
      currency: "KES",
      feePayer: "SENDER" as const,
      bps: 0,
      flat: 0,
      minFee: 0,
      maxFee: null,
    },
  ];

  for (const s of schedules) {
    await prisma.feeSchedule.upsert({
      where: {
        // Use natural key-ish: userId+endpoint+requestHash doesn't apply; so we just look up by name+flow+method+currency
        id: (await prisma.feeSchedule.findFirst({ where: { name: s.name, flow: s.flow, method: s.method, currency: s.currency } }))?.id || crypto.randomUUID(),
      },
      update: {
        active: true,
        flow: s.flow,
        method: s.method,
        currency: s.currency,
        feePayer: s.feePayer,
        bps: s.bps,
        flat: money(s.flat),
        minFee: money(s.minFee),
        maxFee: s.maxFee === null ? null : money(s.maxFee),
        createdBy: adminId,
      },
      create: {
        active: true,
        name: s.name,
        flow: s.flow,
        method: s.method,
        currency: s.currency,
        feePayer: s.feePayer,
        bps: s.bps,
        flat: money(s.flat),
        minFee: money(s.minFee),
        maxFee: s.maxFee === null ? null : money(s.maxFee),
        createdBy: adminId,
      },
    });
  }

  await prisma.platformAccount.upsert({
    where: { currency: "KES" },
    update: {},
    create: { currency: "KES", feeRevenue: money(0), payoutClearing: money(0) },
  });
}

async function main() {
  const passwordPlain = process.env.SEED_PASSWORD || "Password123";
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // Core users for all dashboards/roles
  const admin = await upsertUser({
    email: "admin@bridge.local",
    phone: "+254700000001",
    name: "Bridge Admin",
    role: "ADMIN",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const kycVerifier = await upsertUser({
    email: "kyc.verifier@bridge.local",
    phone: "+254700000002",
    name: "KYC Verifier",
    role: "KYC_VERIFIER",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const projectVerifier = await upsertUser({
    email: "project.verifier@bridge.local",
    phone: "+254700000003",
    name: "Project Verifier",
    role: "PROJECT_VERIFIER",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const merchant = await upsertUser({
    email: "merchant@bridge.local",
    phone: "+254700000010",
    name: "Nairobi Mart",
    role: "MERCHANT",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const implementer = await upsertUser({
    email: "implementer@bridge.local",
    phone: "+254700000020",
    name: "Amina Implementer",
    role: "IMPLEMENTER",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const customer = await upsertUser({
    email: "customer@bridge.local",
    phone: "+254700000030",
    name: "Kevin Customer",
    role: "CUSTOMER",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  const projectOwner = await upsertUser({
    email: "owner@bridge.local",
    phone: "+254700000040",
    name: "Grace Project Owner",
    role: "CUSTOMER",
    kycStatus: "VERIFIED",
    passwordHash,
  });

  // Wallets
  await Promise.all([
    upsertWallet(admin.id, { balance: 0 }),
    upsertWallet(kycVerifier.id, { balance: 0 }),
    upsertWallet(projectVerifier.id, { balance: 0 }),
    upsertWallet(merchant.id, { balance: 25_000 }),
    upsertWallet(implementer.id, { balance: 7_500 }),
    upsertWallet(customer.id, { balance: 20_000 }),
    upsertWallet(projectOwner.id, { balance: 15_000, escrowBalance: 6_000 }),
  ]);

  // Profiles
  await prisma.userProfile.upsert({
    where: { userId: implementer.id },
    update: {
      bio: "Field implementer focused on last-mile delivery and reporting.",
      skills: ["Field ops", "Procurement", "Reporting"],
      languages: ["English", "Swahili"],
      availability: "Part-time",
      location: "Nairobi",
      experience: 4,
    },
    create: {
      userId: implementer.id,
      bio: "Field implementer focused on last-mile delivery and reporting.",
      skills: ["Field ops", "Procurement", "Reporting"],
      languages: ["English", "Swahili"],
      availability: "Part-time",
      location: "Nairobi",
      experience: 4,
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: customer.id },
    update: { bio: "Everyday wallet user.", skills: [], languages: ["English", "Swahili"], location: "Nakuru" },
    create: { userId: customer.id, bio: "Everyday wallet user.", skills: [], languages: ["English", "Swahili"], location: "Nakuru" },
  });

  // Merchant profile
  await prisma.merchantProfile.upsert({
    where: { userId: merchant.id },
    update: {
      businessName: "Nairobi Mart",
      businessType: "Retail",
      businessAddress: "CBD, Nairobi",
      paymentMethods: ["qr", "card", "wallet"],
    },
    create: {
      userId: merchant.id,
      businessName: "Nairobi Mart",
      businessType: "Retail",
      businessAddress: "CBD, Nairobi",
      paymentMethods: ["qr", "card", "wallet"],
    },
  });

  // KYC submissions
  for (const u of [merchant, customer, projectOwner, implementer]) {
    await prisma.kYCSubmission.upsert({
      where: { userId: u.id },
      update: {
        status: "VERIFIED",
        idType: "NATIONAL_ID",
        idNumber: `ID-${u.phone.replace(/\D/g, "").slice(-6)}`,
        address: "Kenya",
        documents: { idFront: "s3://demo/id-front.png", selfie: "s3://demo/selfie.png" },
        verifierId: kycVerifier.id,
        verifierNotes: "Seeded KYC approved",
        submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      },
      create: {
        userId: u.id,
        status: "VERIFIED",
        idType: "NATIONAL_ID",
        idNumber: `ID-${u.phone.replace(/\D/g, "").slice(-6)}`,
        address: "Kenya",
        documents: { idFront: "s3://demo/id-front.png", selfie: "s3://demo/selfie.png" },
        verifierId: kycVerifier.id,
        verifierNotes: "Seeded KYC approved",
        submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
      },
    });
  }

  // Project with milestones
  const project = await prisma.project.upsert({
    where: { id: (await prisma.project.findFirst({ where: { title: "Community Water Point" } }))?.id || crypto.randomUUID() },
    update: {
      description: "Transparent community project with milestone-based releases.",
      category: "Water",
      budget: money(10_000),
      ownerId: projectOwner.id,
      implementerId: implementer.id,
      status: "ACTIVE",
      escrowBalance: money(6_000),
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    },
    create: {
      title: "Community Water Point",
      description: "Transparent community project with milestone-based releases.",
      category: "Water",
      budget: money(10_000),
      ownerId: projectOwner.id,
      implementerId: implementer.id,
      status: "ACTIVE",
      escrowBalance: money(6_000),
      startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
      deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      milestones: {
        create: [
          { title: "Materials purchase", description: "Buy pipes and fittings", amount: money(3_000), status: "APPROVED" },
          { title: "Installation", description: "Install and test the water point", amount: money(5_000), status: "IN_PROGRESS" },
          { title: "Handover", description: "Community handover and documentation", amount: money(2_000), status: "PENDING" },
        ],
      },
    },
    include: { milestones: true },
  });

  // Dispute on a milestone
  const disputedMilestone = project.milestones.find((m) => m.status === "IN_PROGRESS") || project.milestones[1];
  await prisma.dispute.create({
    data: {
      projectId: project.id,
      milestoneId: disputedMilestone?.id,
      reporterId: projectOwner.id,
      status: "OPEN",
      priority: "MEDIUM",
      issue: "Need clarification on receipts for materials.",
      evidence: { note: "Seeded dispute", images: [] },
    },
  }).catch(() => {
    // If reseeding and unique constraints change later, ignore duplicates.
  });

  // Conversation + messages
  const convo = await prisma.conversation.create({
    data: {
      projectId: project.id,
      participants: [projectOwner.id, implementer.id],
      lastMessage: "Hi, I’ve uploaded the latest site photos.",
      lastMessageAt: new Date(),
    },
  });

  await prisma.message.createMany({
    data: [
      { conversationId: convo.id, senderId: implementer.id, content: "Hi, I’ve uploaded the latest site photos.", status: "DELIVERED" },
      { conversationId: convo.id, senderId: projectOwner.id, content: "Thanks — please add receipts for the pipes.", status: "DELIVERED" },
    ],
    skipDuplicates: true,
  });

  // Transactions for history pages
  const t1 = await prisma.transaction.create({
    data: {
      toUserId: customer.id,
      amount: money(5_000),
      fee: money(0),
      type: "DEPOSIT",
      status: "SUCCESS",
      reference: `SEED-DEP-${crypto.randomUUID()}`,
      description: "Seed deposit",
      metadata: { method: "seed" },
    },
  });

  const t2 = await prisma.transaction.create({
    data: {
      fromUserId: customer.id,
      toUserId: merchant.id,
      amount: money(1_000),
      fee: money(5),
      type: "PAYMENT",
      status: "SUCCESS",
      reference: `SEED-PAY-${crypto.randomUUID()}`,
      description: "Seed merchant QR payment",
      metadata: { method: "qr", merchantId: merchant.id, fee: { amount: 5, feePayer: "SENDER" } },
    },
  });

  const t3 = await prisma.transaction.create({
    data: {
      fromUserId: customer.id,
      toUserId: projectOwner.id,
      amount: money(250),
      fee: money(0),
      type: "TRANSFER",
      status: "SUCCESS",
      reference: `SEED-TRF-${crypto.randomUUID()}`,
      description: "Seed wallet transfer",
      metadata: { method: "wallet" },
    },
  });

  const t4 = await prisma.transaction.create({
    data: {
      fromUserId: projectOwner.id,
      amount: money(6_000),
      fee: money(0),
      type: "ESCROW_LOCK",
      status: "SUCCESS",
      reference: `SEED-ESC-${crypto.randomUUID()}`,
      description: "Seed escrow lock",
      metadata: { projectId: project.id },
    },
  });

  // Notifications
  await prisma.notification.createMany({
    data: [
      { userId: customer.id, type: "PAYMENT", title: "Welcome to Bridge", message: "Your seeded account is ready.", actionUrl: "/wallet" },
      { userId: merchant.id, type: "PAYMENT", title: "Payment Received", message: "KES 995 received (after fees).", actionUrl: "/wallet" },
      { userId: projectOwner.id, type: "PROJECT", title: "Project Active", message: "Your project is active and funded.", actionUrl: `/projects/${project.id}` },
      { userId: implementer.id, type: "PROJECT", title: "Work Started", message: "Continue with milestone delivery updates.", actionUrl: `/projects/${project.id}` },
    ],
    skipDuplicates: true,
  });

  // Reviews (for profile pages)
  await prisma.review
    .create({
      data: {
        projectId: project.id,
        reviewerId: projectOwner.id,
        revieweeId: implementer.id,
        rating: 5,
        comment: "Great communication and timely updates.",
      },
    })
    .catch(() => {});

  // Daily stats (admin dashboard)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.dailyStat.upsert({
    where: { date: today },
    update: {
      newUsers: 7,
      totalTransactions: 4,
      totalVolume: money(7_250),
      activeProjects: 1,
    },
    create: {
      date: today,
      newUsers: 7,
      totalTransactions: 4,
      totalVolume: money(7_250),
      activeProjects: 1,
    },
  });

  // Fee schedules + platform account
  await seedFeeSchedules(admin.id);

  // A few platform ledger entries for admin screens
  await prisma.platformLedgerEntry.createMany({
    data: [
      { currency: "KES", type: "FEE_REVENUE_CREDIT", amount: money(5), transactionId: t2.id, reference: t2.reference, metadata: { seed: true } },
      { currency: "KES", type: "PAYOUT_CLEARING_CREDIT", amount: money(500), transactionId: t1.id, reference: t1.reference, metadata: { seed: true } },
    ],
    skipDuplicates: true,
  });

  await prisma.platformAccount.update({
    where: { currency: "KES" },
    data: { feeRevenue: money(5), payoutClearing: money(500) },
  });

  // Sessions (optional, for session views if present)
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await prisma.session.createMany({
    data: [
      { userId: admin.id, deviceInfo: "Seeded Session", ipAddress: "127.0.0.1", location: "Local", expiresAt },
      { userId: customer.id, deviceInfo: "Seeded Session", ipAddress: "127.0.0.1", location: "Local", expiresAt },
    ],
    skipDuplicates: true,
  });

  console.log("\n✅ Seed complete.\n");
  console.log("Login credentials (all users):");
  console.log(`- password: ${passwordPlain}`);
  console.log("- admin: admin@bridge.local");
  console.log("- kyc verifier: kyc.verifier@bridge.local");
  console.log("- project verifier: project.verifier@bridge.local");
  console.log("- merchant: merchant@bridge.local");
  console.log("- implementer: implementer@bridge.local");
  console.log("- customer: customer@bridge.local");
  console.log("- project owner: owner@bridge.local");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


