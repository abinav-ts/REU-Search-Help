// Error codes from spec 05 section 6. The UI shows a specific message per code.
export class ApiError extends Error {
  constructor(code, message, retryable = false, status = 500) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
  toJSON() {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

// Anything unexpected becomes an upstream_error without leaking internals.
export function toApiError(e) {
  if (e instanceof ApiError) return e;
  console.log("unexpected error:", e?.name, String(e?.message || e).slice(0, 200));
  return new ApiError("upstream_error", "Something went wrong on our side. Please try again.", true);
}
