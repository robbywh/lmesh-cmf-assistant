import { Transform, Type, plainToInstance } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

import { ConfigurationException } from "../common/exceptions";
import { DEFAULT_TRUST_PROXY } from "./trust-proxy.util";

export enum NodeEnvironment {
  Development = "development",
  Production = "production",
  Test = "test",
}

export enum AiProviderName {
  Ollama = "ollama",
  OpenRouter = "openrouter",
  Gemini = "gemini",
}

/**
 * Parses `"true"`/`"false"` strictly; any other value is returned unchanged so
 * `@IsBoolean` rejects it (plain implicit conversion would turn `"false"` into `true`).
 */
function parseStrictBoolean(value: unknown): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

/**
 * Schema for all environment variables the API reads. Every variable here
 * must also be documented in the root `.env.example`.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsString()
  HOST = "0.0.0.0";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @Matches(/^postgres(ql)?:\/\//, {
    message: "DATABASE_URL must be a postgresql:// connection string",
  })
  DATABASE_URL!: string;

  /** Signs and encrypts better-auth sessions and cookies. */
  @IsString()
  @MinLength(32)
  BETTER_AUTH_SECRET!: string;

  /** Public origin of the app that better-auth issues cookies for. */
  @IsUrl({ require_tld: false })
  BETTER_AUTH_URL = "http://localhost:5173";

  /**
   * Proxies Fastify trusts for the client IP: a hop count (default 1 = nginx),
   * "true"/"false", or a comma-separated list of addresses/CIDRs.
   */
  @IsString()
  TRUST_PROXY: string = DEFAULT_TRUST_PROXY;

  @IsString()
  CORS_ORIGIN = "http://localhost:5173";

  @IsEnum(AiProviderName)
  AI_PROVIDER: AiProviderName = AiProviderName.OpenRouter;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  AI_REQUEST_TIMEOUT_MS: number = 120000;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  AI_FIRST_TOKEN_TIMEOUT_MS: number = 30000;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  AI_HISTORY_MAX_CHARS: number = 24000;

  /**
   * Mount Swagger at /api/docs in production (outside production it is always on).
   * Strict "true"/"false" like AI_FAULT_INJECTION.
   */
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    parseStrictBoolean(obj[key]),
  )
  @IsBoolean({ message: 'SWAGGER_ENABLED must be "true" or "false"' })
  SWAGGER_ENABLED: boolean = false;

  /** Enables e2e fault injection; only `docker-compose.e2e.yml` turns it on. */
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
    parseStrictBoolean(obj[key]),
  )
  @IsBoolean({ message: 'AI_FAULT_INJECTION must be "true" or "false"' })
  AI_FAULT_INJECTION: boolean = false;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  AI_HISTORY_MAX_MESSAGES: number = 20;

  @IsOptional()
  @IsUrl({ require_tld: false })
  OLLAMA_BASE_URL?: string;

  @IsOptional()
  @IsString()
  OLLAMA_MODEL?: string;

  @IsOptional()
  @IsString()
  OPENROUTER_API_KEY?: string;

  @IsOptional()
  @IsString()
  OPENROUTER_MODEL?: string;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL?: string;
}

/**
 * Validates and coerces raw environment variables at startup; used as the
 * `validate` option of `ConfigModule.forRoot`.
 * @param config Raw `process.env`-style record.
 * @returns The validated, typed configuration.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map(
        (error) =>
          `${error.property}: ${Object.values(error.constraints ?? {}).join(", ")}`,
      )
      .join("; ");
    // Runs before Nest bootstraps, so no app exception filter can handle this;
    // failing fast with the error message is intentional.
    throw new ConfigurationException(
      `Invalid environment configuration: ${details}`,
    );
  }

  return validated;
}
