import { ErrorCode, ErrorEnvelopeSchema, type ErrorEnvelope } from "@lmesh/api-contract";

/** Error thrown for every failed API call (HTTP error, bad payload or network failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly errors: ErrorEnvelope["errors"];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    errors?: ErrorEnvelope["errors"],
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  /** Builds an `INTERNAL_ERROR` ApiError for failures without a usable error envelope. */
  static internal(message: string, status = 0): ApiError {
    return new ApiError(status, ErrorCode.INTERNAL_ERROR, message);
  }
}

/** Type guard for {@link ApiError}. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Reads a JSON body, returning `undefined` when it is empty or not JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Converts a non-2xx response into an ApiError (`INTERNAL_ERROR` when the body is not an error envelope). */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const parsed = ErrorEnvelopeSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return ApiError.internal(`Request failed with status ${response.status}`, response.status);
  }
  const { code, message, errors } = parsed.data;
  return new ApiError(response.status, code, message, errors);
}
