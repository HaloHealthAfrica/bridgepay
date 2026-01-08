import { Router } from "express";
import { authRouter } from "./auth.routes";
import { walletRouter } from "./wallet.routes";
import { callbackRouter } from "./webhook.routes";
import { projectRouter } from "./project.routes";
import { merchantRouter } from "./merchant.routes";
import { userRouter } from "./user.routes";
import { reviewRouter } from "./review.routes";
import { messageRouter } from "./message.routes";
import { notificationRouter } from "./notification.routes";
import { kycRouter } from "./kyc.routes";
import { accountRouter } from "./account.routes";
import { adminRouter } from "./admin.routes";
import transactionReceiptRouter from "./transactionReceipt.routes";
import transactionRouter from "./transaction.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/wallet", walletRouter);
apiRouter.use("/callback", callbackRouter);
apiRouter.use("/projects", projectRouter);
apiRouter.use("/merchant", merchantRouter);
apiRouter.use("/users", userRouter);
apiRouter.use("/reviews", reviewRouter);
apiRouter.use("/messages", messageRouter);
apiRouter.use("/notifications", notificationRouter);
apiRouter.use("/kyc", kycRouter);
apiRouter.use("/account", accountRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/transactions", transactionRouter);
apiRouter.use("/transactions/receipts", transactionReceiptRouter);


