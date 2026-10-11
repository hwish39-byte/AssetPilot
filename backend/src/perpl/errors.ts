export type PerplErrorCode =
  | "PERPL_CREDENTIALS_NOT_CONFIGURED"
  | "PERPL_CONFIG_ERROR"
  | "PERPL_HTTP_ERROR"
  | "PERPL_RATE_LIMITED"
  | "PERPL_SERVICE_UNAVAILABLE"
  | "PERPL_UNAUTHORIZED"
  | "PERPL_FORBIDDEN"
  | "PERPL_NOT_FOUND"
  | "PERPL_NETWORK_ERROR"
  | "PERPL_INVALID_JSON"
  | "PERPL_TRADING_DISABLED"
  | "PERPL_TRADING_UNSUPPORTED"
  | "PERPL_TRADING_INTENT_NOT_FOUND"
  | "PERPL_TRADING_INTENT_EXPIRED"
  | "PERPL_TRADING_VALIDATION_FAILED";

export class PerplApiError extends Error {
  readonly code: PerplErrorCode;
  readonly statusCode: number;
  readonly perplStatus?: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(args: {
    code: PerplErrorCode;
    message: string;
    statusCode?: number;
    perplStatus?: number;
    retryable?: boolean;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "PerplApiError";
    this.code = args.code;
    this.statusCode = args.statusCode ?? 502;
    this.perplStatus = args.perplStatus;
    this.retryable = args.retryable ?? false;
    this.details = args.details;
  }
}

export function codeForPerplStatus(status: number): PerplErrorCode {
  if (status === 401) return "PERPL_UNAUTHORIZED";
  if (status === 403) return "PERPL_FORBIDDEN";
  if (status === 404) return "PERPL_NOT_FOUND";
  if (status === 429) return "PERPL_RATE_LIMITED";
  if (status === 503) return "PERPL_SERVICE_UNAVAILABLE";
  return "PERPL_HTTP_ERROR";
}

export function statusForPerplStatus(status: number): number {
  if ([400, 401, 403, 404, 429, 503].includes(status)) return status;
  return 502;
}

export function toPublicPerplError(error: PerplApiError) {
  return {
    error: {
      code: error.code,
      message: redactSensitive(error.message),
      perplStatus: error.perplStatus ?? null,
      retryable: error.retryable
    }
  };
}

function redactSensitive(message: string): string {
  return message.replace(/\S*(?:api[-_ ]?key|key|secret|signature|nonce|headers?)\S*/gi, "[redacted]");
}
