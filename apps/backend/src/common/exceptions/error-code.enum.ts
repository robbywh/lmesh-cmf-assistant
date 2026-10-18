/**
 * Machine-readable error codes returned in the `code` field of every error response.
 * The contract package is the single source of truth; this re-export keeps
 * `import { ErrorCode } from "../common/exceptions"` working across the backend.
 */
export { ErrorCode } from "@lmesh/api-contract";
