import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export const http = axios.create({
  baseURL,
  timeout: 30000, // 30 second timeout
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

// Request interceptor - Add auth token and idempotency key
http.interceptors.request.use(
  (config) => {
    // Add authorization token
    const token = localStorage.getItem("bridge_access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add idempotency key for payment endpoints (required by backend middleware).
    // If caller already set it, don't overwrite.
    const method = String(config.method || "").toLowerCase();
    const url = String(config.url || "");
    const hasKey = !!config.headers?.["Idempotency-Key"] || !!config.headers?.["idempotency-key"];

    const isPayment =
      url.includes("/wallet/deposit/mpesa") ||
      url.includes("/wallet/deposit/card") ||
      url.includes("/wallet/deposit/paybill") ||
      url.includes("/wallet/transfer") ||
      url.includes("/wallet/withdraw/mpesa") ||
      url.includes("/wallet/withdraw/bank") ||
      url.includes("/wallet/send/mpesa") ||
      url.includes("/merchant/qr/pay") ||
      url.includes("/merchant/card/pay") ||
      /\/projects\/[^/]+\/fund(\/card)?$/.test(url);

    if (!hasKey && isPayment && method === "post") {
      config.headers["Idempotency-Key"] = crypto.randomUUID();
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle 401 errors and refresh token
http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return axios(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("bridge_refresh_token");

      if (!refreshToken) {
        // No refresh token, logout user
        localStorage.removeItem("bridge_access_token");
        localStorage.removeItem("bridge_refresh_token");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        // Attempt to refresh token
        const response = await axios.post(`${baseURL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;

        // Store new tokens
        localStorage.setItem("bridge_access_token", accessToken);
        localStorage.setItem("bridge_refresh_token", newRefreshToken);

        // Update authorization header
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process queued requests
        processQueue(null, accessToken);

        isRefreshing = false;

        // Retry original request
        return axios(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        processQueue(refreshError, null);
        isRefreshing = false;

        localStorage.removeItem("bridge_access_token");
        localStorage.removeItem("bridge_refresh_token");
        window.location.href = "/login";

        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);


