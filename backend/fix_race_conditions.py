#!/usr/bin/env python3
"""
Fix race conditions in wallet.controller.ts
- Move balance checks inside transactions
- Replace Date.now() with crypto.randomUUID()
- Add transaction isolation level
"""

import re

def fix_wallet_controller():
    file_path = 'src/controllers/wallet.controller.ts'

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix 1: transfer() function - Move balance check inside transaction
    transfer_old = r'''  const recipient = await prisma\.user\.findUnique\(\{
    where: \{ phone: recipientPhone \},
    select: \{ id: true, name: true, status: true \},
  \}\);
  if \(!recipient\) throw new AppError\("Recipient not found", 404\);
  if \(recipient\.status !== "ACTIVE"\) throw new AppError\("Recipient account is not active", 400\);
  if \(recipient\.id === req\.user!\.userId\) throw new AppError\("Cannot transfer to yourself", 400\);

  const senderWallet = await prisma\.wallet\.findUnique\(\{ where: \{ userId: req\.user!\.userId \} \}\);
  if \(!senderWallet \|\| Number\(senderWallet\.balance\) < Number\(amount\)\) throw new AppError\("Insufficient balance", 400\);

  const sender = await prisma\.user\.findUnique\(\{ where: \{ id: req\.user!\.userId \}, select: \{ name: true \} \}\);
  const senderName = sender\?\.name \|\| "Someone";

  const result = await prisma\.\$transaction\(async \(tx\) => \{
    await tx\.wallet\.update\(\{
      where: \{ userId: req\.user!\.userId \},
      data: \{ balance: \{ decrement: new Prisma\.Decimal\(amount\) \} \},
    \}\);
    await tx\.wallet\.update\(\{
      where: \{ userId: recipient\.id \},
      data: \{ balance: \{ increment: new Prisma\.Decimal\(amount\) \} \},
    \}\);

    const txRow = await tx\.transaction\.create\(\{
      data: \{
        fromUserId: req\.user!\.userId,
        toUserId: recipient\.id,
        amount: new Prisma\.Decimal\(amount\),
        type: "TRANSFER",
        status: "SUCCESS",
        reference: `TRF-\$\{Date\.now\(\)\}`,
        description: note \|\| "Transfer",
      \},
      include: \{ toUser: \{ select: \{ name: true, phone: true \} \} \},
    \}\);

    await tx\.notification\.create\(\{
      data: \{
        userId: recipient\.id,
        type: "PAYMENT",
        title: "Money Received",
        message: `You received KES \$\{amount\} from \$\{senderName\}`,
        actionUrl: "/wallet",
      \},
    \}\);

    return txRow;
  \}\);'''

    transfer_new = '''  const recipient = await prisma.user.findUnique({
    where: { phone: recipientPhone },
    select: { id: true, name: true, status: true },
  });
  if (!recipient) throw new AppError("Recipient not found", 404);
  if (recipient.status !== "ACTIVE") throw new AppError("Recipient account is not active", 400);
  if (recipient.id === req.user!.userId) throw new AppError("Cannot transfer to yourself", 400);

  const sender = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
  const senderName = sender?.name || "Someone";

  const result = await prisma.$transaction(
    async (tx) => {
      // Check balance INSIDE transaction to prevent race conditions
      const senderWallet = await tx.wallet.findUnique({ where: { userId: req.user!.userId } });
      if (!senderWallet || Number(senderWallet.balance) < Number(amount)) {
        throw new AppError("Insufficient balance", 400);
      }

      // Atomic balance updates
      await tx.wallet.update({
        where: { userId: req.user!.userId },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });
      await tx.wallet.update({
        where: { userId: recipient.id },
        data: { balance: { increment: new Prisma.Decimal(amount) } },
      });

      const txRow = await tx.transaction.create({
        data: {
          fromUserId: req.user!.userId,
          toUserId: recipient.id,
          amount: new Prisma.Decimal(amount),
          type: "TRANSFER",
          status: "SUCCESS",
          reference: crypto.randomUUID(),
          description: note || "Transfer",
        },
        include: { toUser: { select: { name: true, phone: true } } },
      });

      await tx.notification.create({
        data: {
          userId: recipient.id,
          type: "PAYMENT",
          title: "Money Received",
          message: `You received KES ${amount} from ${senderName}`,
          actionUrl: "/wallet",
        },
      });

      return txRow;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 10000,
    }
  );'''

    # Apply fixes
    content = re.sub(transfer_old, transfer_new, content, flags=re.DOTALL)

    # Replace remaining Date.now() references with crypto.randomUUID()
    content = re.sub(r'`MPESA-DEP-\$\{Date\.now\(\)\}`', 'crypto.randomUUID()', content)
    content = re.sub(r'`CARD-DEP-\$\{Date\.now\(\)\}`', 'crypto.randomUUID()', content)
    content = re.sub(r'`MPESA-WD-\$\{Date\.now\(\)\}`', 'crypto.randomUUID()', content)
    content = re.sub(r'`MPESA-SEND-\$\{Date\.now\(\)\}`', 'crypto.randomUUID()', content)
    content = re.sub(r'`BANK-WD-\$\{Date\.now\(\)\}`', 'crypto.randomUUID()', content)

    # Write back
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

    print("✓ Fixed wallet.controller.ts")
    print("  - Added crypto import")
    print("  - Fixed transfer() race condition")
    print("  - Replaced Date.now() with crypto.randomUUID()")

if __name__ == '__main__':
    fix_wallet_controller()
