import { Type, plainToInstance } from "class-transformer";
import {
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

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN = "1d";

  @IsString()
  CORS_ORIGIN = "http://localhost:5173";

  @IsEnum(AiProviderName)
  AI_PROVIDER: AiProviderName = AiProviderName.Ollama;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  AI_REQUEST_TIMEOUT_MS: number = 60000;

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
    // failing fast with a plain error is intentional.
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return validated;
}
