import { http } from "./http";

export const authAPI = {
  register: (body: { email: string; phone: string; password: string; name: string; role?: string }) =>
    http.post("/auth/register", body),
  login: (body: { email: string; password: string; twoFactorCode?: string }) => http.post("/auth/login", body),
  me: () => http.get("/auth/me"),
  refresh: (body: { refreshToken: string }) => http.post("/auth/refresh", body),
  logout: () => http.post("/auth/logout"),
};

export const walletAPI = {
  getBalance: () => http.get("/wallet/balance"),
  getTransactions: (params: { page?: number; limit?: number; type?: string; status?: string }) =>
    http.get("/wallet/transactions", { params }),
  depositMpesa: (body: { amount: number; phone: string }) => http.post("/wallet/deposit/mpesa", body),
  depositCard: (body: { amount: number }) => http.post("/wallet/deposit/card", body),
  checkCardPaymentStatus: (providerTransactionId: string) => http.get(`/wallet/card/status/${providerTransactionId}`),
  sendMpesa: (body: { amount: number; phone: string; note?: string }) => http.post("/wallet/send/mpesa", body),
  withdrawMpesa: (body: { amount: number; phone: string }) => http.post("/wallet/withdraw/mpesa", body),
  withdrawBank: (body: { amount: number; bankCode: string; accountNumber: string; accountName: string; note?: string }) =>
    http.post("/wallet/withdraw/bank", body),
  transfer: (body: { recipientPhone: string; amount: number; note?: string }) => http.post("/wallet/transfer", body),
  checkPaymentStatus: (checkoutRequestID: string) => http.get(`/wallet/mpesa/status/${checkoutRequestID}`),
  createReceipt: (transactionId: string) => http.post(`/wallet/transactions/${transactionId}/receipt`),
  depositPaybill: (body: { amount: number }) => http.post("/wallet/deposit/paybill", body),
};

// Enhanced Transaction API for advanced filtering, search, and analytics
export const transactionAPI = {
  // Enhanced transaction listing with filtering
  getTransactions: (params?: any) => http.get("/transactions", { params }),
  
  // Search functionality
  searchTransactions: (params: { query: string; page?: number; limit?: number; highlight?: boolean }) =>
    http.get("/transactions/search", { params }),
  getSearchSuggestions: (params: { query: string }) =>
    http.get("/transactions/search/suggestions", { params }),
  
  // Transaction details
  getTransactionDetails: (id: string) => http.get(`/transactions/${id}`),
  
  // Categories
  getCategories: () => http.get("/transactions/categories"),
  createCategory: (body: { name: string; color?: string; icon?: string }) =>
    http.post("/transactions/categories", body),
  updateCategory: (id: string, body: { name?: string; color?: string; icon?: string }) =>
    http.put(`/transactions/categories/${id}`, body),
  deleteCategory: (id: string) => http.delete(`/transactions/categories/${id}`),
  
  // Category assignment
  assignCategory: (body: { transactionIds: string[]; categoryId: string }) =>
    http.post("/transactions/assign-category", body),
  bulkAssignCategory: (body: { transactionIds: string[]; categoryId: string }) =>
    http.post("/transactions/bulk-assign-category", body),
  getCategorySuggestions: (id: string) => http.get(`/transactions/category-suggestions/${id}`),
  
  // Filter presets
  getFilterPresets: () => http.get("/transactions/filters/presets"),
  saveFilterPreset: (body: { name: string; filters: any }) =>
    http.post("/transactions/filters/presets", body),
  deleteFilterPreset: (id: string) => http.delete(`/transactions/filters/presets/${id}`),
  
  // Analytics
  getSpendingTrends: (params: { startDate: string; endDate: string }) =>
    http.get("/transactions/analytics/trends", { params }),
  getTransactionInsights: (params: { startDate: string; endDate: string }) =>
    http.get("/transactions/analytics/insights", { params }),
  getCategoryBreakdown: (params: { startDate: string; endDate: string }) =>
    http.get("/transactions/analytics/category-breakdown", { params }),
  comparePeriods: (params: { 
    period1Start: string; 
    period1End: string; 
    period2Start: string; 
    period2End: string; 
  }) => http.get("/transactions/analytics/compare-periods", { params }),
  
  // Export
  createExport: (body: { 
    format: 'CSV' | 'PDF'; 
    filters?: any; 
    includeAnalytics?: boolean; 
    emailDelivery?: boolean; 
  }) => http.post("/transactions/export", body),
  getExportStatus: (id: string) => http.get(`/transactions/export/${id}/status`),
  downloadExport: (id: string, token: string) => 
    http.get(`/transactions/export/${id}/download`, { params: { token } }),
  emailExport: (id: string, body: { email: string }) =>
    http.post(`/transactions/export/${id}/email`, body),
  getExportHistory: (params?: { limit?: number }) =>
    http.get("/transactions/exports", { params }),
  cancelExport: (id: string) => http.delete(`/transactions/export/${id}`),
  
  // Receipts
  generateReceipt: (id: string, body?: { 
    format?: 'PDF' | 'HTML'; 
    includeQRCode?: boolean; 
    includeLogo?: boolean; 
    customMessage?: string; 
  }) => http.post(`/transactions/${id}/receipt`, body),
  getReceiptStatus: (id: string) => http.get(`/transactions/${id}/receipt/status`),
  generateBulkReceipts: (body: { 
    transactionIds: string[]; 
    format?: 'PDF' | 'HTML'; 
    includeQRCode?: boolean; 
    includeLogo?: boolean; 
    emailDelivery?: boolean; 
  }) => http.post("/transactions/receipts/bulk", body),
  getReceiptSharingOptions: (id: string) => http.get(`/transactions/${id}/receipt/sharing`),
  shareReceipt: (id: string, body: { 
    method: 'EMAIL' | 'LINK' | 'SMS'; 
    recipient: string; 
    message?: string; 
    expiresIn?: number; 
  }) => http.post(`/transactions/${id}/receipt/share`, body),
};

export const merchantAPI = {
  me: () => http.get("/merchant/me"),
  generateQRCode: () => http.post("/merchant/qr"),
  processQRPayment: (body: { merchantId: string; amount: number; note?: string }) => http.post("/merchant/qr/pay", body),
  getMerchantPublic: (merchantId: string) => http.get(`/merchant/${merchantId}/public`),
  payByCard: (body: { merchantId: string; amount: number; note?: string }) => http.post("/merchant/card/pay", body),
  checkCardPaymentStatus: (providerTransactionId: string) => http.get(`/merchant/card/status/${providerTransactionId}`),
  getSalesStats: (params: { period?: "today" | "7days" | "30days" } = {}) => http.get("/merchant/sales", { params }),
};

export const projectAPI = {
  createProject: (body: {
    title: string;
    description: string;
    category?: string;
    budget: number;
    deadline?: string;
    milestones: { title: string; description: string; amount: number; dueDate?: string }[];
  }) => http.post("/projects", body),
  getProjects: (params: { page?: number; limit?: number; status?: string; category?: string; search?: string; role?: string } = {}) =>
    http.get("/projects", { params }),
  getProjectById: (id: string) => http.get(`/projects/${id}`),
  publishProject: (id: string) => http.post(`/projects/${id}/publish`),
  applyToProject: (id: string, body: { coverLetter?: string; proposedRate?: number; estimatedDuration?: string }) =>
    http.post(`/projects/${id}/apply`, body),
  assignImplementer: (id: string, implementerId: string) => http.post(`/projects/${id}/assign`, { implementerId }),
  fundProject: (id: string) => http.post(`/projects/${id}/fund`),
  fundProjectCard: (id: string, body: { amount: number }) => http.post(`/projects/${id}/fund/card`, body),
  checkProjectCardFundingStatus: (providerTransactionId: string) => http.get(`/projects/card/status/${providerTransactionId}`),
  approveMilestone: (projectId: string, milestoneId: string, notes?: string) =>
    http.post(`/projects/${projectId}/milestones/${milestoneId}/approve`, { notes }),
  rejectMilestone: (projectId: string, milestoneId: string, reason?: string) =>
    http.post(`/projects/${projectId}/milestones/${milestoneId}/reject`, { reason }),
  submitEvidence: (projectId: string, milestoneId: string, body: { description?: string; links?: string[]; files?: File[] }) => {
    const fd = new FormData();
    if (body.description) fd.append("description", body.description);
    if (body.links && body.links.length) fd.append("links", JSON.stringify(body.links));
    (body.files || []).forEach((f) => fd.append("files", f));
    return http.post(`/projects/${projectId}/milestones/${milestoneId}/evidence`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const notificationAPI = {
  list: (params: { page?: number; limit?: number; unread?: boolean } = {}) =>
    http.get("/notifications", { params: { ...params, unread: params.unread ? "true" : undefined } }),
  markRead: (id: string) => http.post(`/notifications/${id}/read`),
  markAllRead: () => http.post("/notifications/read-all"),
};

export const kycAPI = {
  me: () => http.get("/kyc/me"),
  submit: (body: { idType?: string; idNumber?: string; dateOfBirth?: string; address?: string; files?: File[] }) => {
    const fd = new FormData();
    if (body.idType) fd.append("idType", body.idType);
    if (body.idNumber) fd.append("idNumber", body.idNumber);
    if (body.dateOfBirth) fd.append("dateOfBirth", body.dateOfBirth);
    if (body.address) fd.append("address", body.address);
    (body.files || []).forEach((f) => fd.append("files", f));
    return http.post("/kyc/submit", fd, { headers: { "Content-Type": "multipart/form-data" } });
  },
};

export const accountAPI = {
  updateMe: (body: { name?: string; email?: string; phone?: string }) => http.put("/account/me", body),
  sessions: () => http.get("/account/sessions"),
};

export const adminAPI = {
  stats: () => http.get("/admin/stats"),
  users: (params: { page?: number; limit?: number; q?: string; role?: string; status?: string; kycStatus?: string } = {}) =>
    http.get("/admin/users", { params }),
  updateUserStatus: (id: string, status: string) => http.patch(`/admin/users/${id}/status`, { status }),
  updateUserRole: (id: string, role: string) => http.patch(`/admin/users/${id}/role`, { role }),
  transactions: (params: { page?: number; limit?: number; q?: string; type?: string; status?: string } = {}) =>
    http.get("/admin/transactions", { params }),
  wallets: (params: { page?: number; limit?: number; q?: string } = {}) => http.get("/admin/wallets", { params }),
  kyc: (params: { page?: number; limit?: number; status?: string } = {}) => http.get("/admin/kyc", { params }),
  reviewKyc: (userId: string, action: "APPROVE" | "REJECT", notes?: string) =>
    http.post(`/admin/kyc/${userId}/review`, { action, notes }),
  disputes: (params: { page?: number; limit?: number; status?: string; priority?: string } = {}) =>
    http.get("/admin/disputes", { params }),
};



export const userAPI = {
  search: (params: { q?: string; role?: string } = {}) => http.get("/users/search", { params }),
  getImplementers: (params: { page?: number; limit?: number; skills?: string; minRating?: number } = {}) =>
    http.get("/users/implementers", { params }),
  getImplementerById: (id: string) => http.get(`/users/implementers/${id}`),
  updateProfile: (body: {
    bio?: string;
    skills?: string[];
    hourlyRate?: number;
    availability?: string;
    location?: string;
    languages?: string[];
    experience?: number;
  }) => http.put("/users/profile", body),
};

export const reviewAPI = {
  create: (body: { projectId: string; revieweeId: string; rating: number; comment?: string }) =>
    http.post("/reviews", body),
  getByUserId: (userId: string, params: { page?: number; limit?: number } = {}) =>
    http.get(`/reviews/${userId}`, { params }),
};

export const messageAPI = {
  getConversations: (params: { page?: number; limit?: number } = {}) =>
    http.get("/messages/conversations", { params }),
  getConversation: (conversationId: string, params: { page?: number; limit?: number } = {}) =>
    http.get(`/messages/conversations/${conversationId}`, { params }),
  createConversation: (body: { projectId?: string; participants: string[] }) =>
    http.post("/messages/conversations", body),
  sendMessage: (conversationId: string, body: { content: string; attachments?: any[] }) =>
    http.post(`/messages/conversations/${conversationId}/messages`, body),
};
