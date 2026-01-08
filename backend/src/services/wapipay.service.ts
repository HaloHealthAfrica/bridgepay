import axios from "axios";

type WapiPayPayoutResult = {
  providerRef: string;
  raw: any;
};

/**
 * WapiPay integration (Diaspora rails + bank payouts).
 *
 * NOTE: The docs site isn't reachable from this environment, so this service is implemented
 * as a configurable adapter. You must set the endpoint paths via env vars to match WapiPay.
 */
class WapiPayService {
  private baseUrl: string;
  private bearerToken: string;

  constructor() {
    this.baseUrl = process.env.WAPIPAY_BASE_URL || "";
    this.bearerToken = process.env.WAPIPAY_BEARER_TOKEN || "";
  }

  private assertConfigured() {
    if (!this.baseUrl) throw new Error("WAPIPAY_BASE_URL not configured");
    if (!this.bearerToken) throw new Error("WAPIPAY_BEARER_TOKEN not configured");
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.bearerToken}`,
      "Content-Type": "application/json",
    };
  }

  async createBankPayout(payload: any): Promise<WapiPayPayoutResult> {
    this.assertConfigured();
    const path = process.env.WAPIPAY_PAYOUT_BANK_PATH || "/payouts/bank";
    const { data } = await axios.post(`${this.baseUrl}${path}`, payload, { headers: this.headers() });
    const providerRef = data?.reference || data?.id || data?.data?.reference || data?.data?.id;
    if (!providerRef) throw new Error("WapiPay payout did not return a reference");
    return { providerRef: String(providerRef), raw: data };
  }

  async createDiasporaPayin(payload: any): Promise<{ checkoutUrl: string; providerRef: string; raw: any }> {
    this.assertConfigured();
    const path = process.env.WAPIPAY_PAYIN_PATH || "/collections/checkout";
    const { data } = await axios.post(`${this.baseUrl}${path}`, payload, { headers: this.headers() });
    const checkoutUrl = data?.checkout_url || data?.data?.checkout_url || data?.url || data?.data?.url;
    const providerRef = data?.reference || data?.id || data?.data?.reference || data?.data?.id;
    if (!checkoutUrl || !providerRef) throw new Error("WapiPay pay-in did not return checkout URL/reference");
    return { checkoutUrl: String(checkoutUrl), providerRef: String(providerRef), raw: data };
  }
}

export default new WapiPayService();


