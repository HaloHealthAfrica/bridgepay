import { useEffect, useState } from "react";
import { walletAPI } from "../../services/api";
import { WalletCard } from "../../components/wallet/WalletCard";
import { QuickActions } from "../../components/wallet/QuickActions";
import { TransactionList } from "../../components/wallet/TransactionList";

type WalletBalance = {
  balance: number;
  pendingBalance: number;
  escrowBalance: number;
  currency: string;
};

export const WalletDashboard = () => {
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const [walletRes, txRes] = await Promise.all([
        walletAPI.getBalance(),
        walletAPI.getTransactions({ page: 1, limit: 5 }),
      ]);

      setWallet(walletRes.data.data);
      setTransactions(txRes.data.data.transactions);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  if (!wallet) return <div>Unable to load wallet.</div>;

  return (
    <div className="p-2">
      <WalletCard balance={wallet.balance} pending={wallet.pendingBalance} escrow={wallet.escrowBalance} />
      <div className="h-6" />
      <QuickActions />
      <div className="h-6" />
      <TransactionList transactions={transactions} />
    </div>
  );
};




