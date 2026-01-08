import type { Request } from "express";

/**
 * Webhook Security Utilities
 *
 * Provides IP validation and timestamp verification for webhook endpoints
 */

// Helper function for IP range checking (CIDR notation)
function ipToNumber(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function ipInRange(ip: string, range: string): boolean {
  if (!range.includes("/")) {
    return ip === range;
  }

  const [subnet, bits] = range.split("/");
  if (!subnet || !bits) return false;
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);

  const ipNum = ipToNumber(ip);
  const subnetNum = ipToNumber(subnet);

  return (ipNum & mask) === (subnetNum & mask);
}

/**
 * Extract source IP from request, considering proxies and load balancers
 */
function getSourceIp(req: Request): string {
  const clientIp = req.ip || req.connection.remoteAddress || "";
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    const forwardedArray = Array.isArray(forwarded) ? forwarded : [forwarded];
    const first = forwardedArray[0];
    if (typeof first === "string" && first.length > 0) {
      const sourceIp = first.split(",")[0]?.trim() || "";
      if (sourceIp) return sourceIp;
    }
  }

  return clientIp;
}

/**
 * Verify Lemonade webhook source IP
 *
 * @param req - Express request object
 * @returns true if IP is allowed, false otherwise
 */
export function verifyLemonadeSource(req: Request): boolean {
  const allowedIpsEnv = process.env.LEMONADE_ALLOWED_IPS;

  // If no IPs configured, reject (fail-secure)
  if (!allowedIpsEnv) {
    console.error("[WebhookSecurity] LEMONADE_ALLOWED_IPS not configured");
    return false;
  }

  const allowedIps = allowedIpsEnv.split(",").map((ip) => ip.trim());

  if (allowedIps.length === 0) {
    console.error(
      "[WebhookSecurity] LEMONADE_ALLOWED_IPS is empty"
    );
    return false;
  }

  const sourceIp = getSourceIp(req);

  const isAllowed = allowedIps.some((allowedIp) => {
    if (allowedIp.includes("/")) {
      // CIDR notation
      return ipInRange(sourceIp, allowedIp);
    } else {
      // Exact match
      return sourceIp === allowedIp;
    }
  });

  if (!isAllowed) {
    console.warn(
      `[WebhookSecurity] Rejected Lemonade webhook from unauthorized IP: ${sourceIp}`
    );
    console.warn(
      `[WebhookSecurity] Allowed IPs: ${allowedIps.join(", ")}`
    );
  }

  return isAllowed;
}

/**
 * Validates webhook timestamp to prevent replay attacks
 *
 * @param timestamp - Unix timestamp (seconds) from webhook
 * @param maxAgeSeconds - Maximum age in seconds (default 300 = 5 minutes)
 * @returns true if timestamp is valid and recent, false otherwise
 */
export function isTimestampValid(
  timestamp: string | number | undefined,
  maxAgeSeconds: number = 300
): boolean {
  if (!timestamp) {
    return false;
  }

  try {
    const webhookTime =
      typeof timestamp === "string" ? parseInt(timestamp, 10) : timestamp;

    if (isNaN(webhookTime)) {
      console.warn(
        `[WebhookSecurity] Invalid timestamp format: ${timestamp}`
      );
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - webhookTime);

    if (timeDiff > maxAgeSeconds) {
      console.warn(
        `[WebhookSecurity] Timestamp too old: ${timeDiff}s (max: ${maxAgeSeconds}s)`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[WebhookSecurity] Timestamp validation error:", error);
    return false;
  }
}

/**
 * M-Pesa IP verification (existing functionality preserved)
 */
const MPESA_ALLOWED_IPS = [
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.212.127",
  "196.201.212.128",
  "196.201.212.129",
  "196.201.212.130",
  "196.201.212.131",
  "196.201.212.132",
  // Sandbox/Development IPs
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
];

export function verifyMpesaSource(req: Request): boolean {
  // Skip IP check in development or if explicitly disabled
  if (process.env.MPESA_SKIP_IP_CHECK === "true") {
    return true;
  }

  const sourceIp = getSourceIp(req);

  const isAllowed = MPESA_ALLOWED_IPS.some((allowedIp) => {
    return sourceIp?.includes(allowedIp);
  });

  if (!isAllowed) {
    console.warn(
      `[WebhookSecurity] Rejected M-Pesa webhook from unauthorized IP: ${sourceIp}`
    );
  }

  return isAllowed;
}
