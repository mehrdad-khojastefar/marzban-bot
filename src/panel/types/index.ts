export interface AdminSession {
  chatId: string;
  username: string;
  firstName: string;
}

export interface DashboardStats {
  totalUsers: number;
  totalAccounts: number;
  activeAccounts: number;
  totalSellers: number;
  totalDebt: number;
  pendingPayments: number;
}

export interface SellerWithDebt {
  id: number;
  chatId: string;
  userId: number | null;
  note: string | null;
  linkPrefix: string | null;
  isActive: boolean;
  userName: string | null;
  userUsername: string | null;
  totalDebt: number;
  accountCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FinanceData {
  totalRevenue: number;
  totalDebt: number;
  sellerBreakdown: SellerFinance[];
  cardBreakdown: CardFinance[];
  recentTransactions: RecentTransaction[];
  monthlyRevenue: MonthlyRevenue[];
}

export interface SellerFinance {
  sellerId: number;
  sellerName: string;
  totalAccounts: number;
  paidAmount: number;
  unpaidDebt: number;
  activeAccounts: number;
}

export interface CardFinance {
  cardId: number;
  lastFour: string;
  holderName: string;
  totalReceived: number;
  transactionCount: number;
}

export interface RecentTransaction {
  id: number;
  transactionId: string;
  userName: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface TransactionRow {
  id: number;
  transactionId: string;
  userId: number;
  userName: string;
  userUsername: string | null;
  planName: string | null;
  amount: number;
  status: string;
  method: string;
  createdAt: string;
}

export interface UserRow {
  id: number;
  chatId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  hasTest: boolean;
  createdAt: string;
  accountCount: number;
  transactionCount: number;
}

export interface CardRow {
  id: number;
  lastFour: string;
  holderName: string;
  bankName: string | null;
  isActive: boolean;
  assignedUserCount: number;
  totalRevenue: number;
}
