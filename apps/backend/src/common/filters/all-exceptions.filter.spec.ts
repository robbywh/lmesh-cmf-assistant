import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import {
  ErrorCode,
  NotFoundException,
  ServiceUnavailableException,
  ValidationException,
} from "../exceptions";
import { AllExceptionsFilter } from "./all-exceptions.filter";

interface ReplyMock {
  sent: boolean;
  status: Mock;
  send: Mock;
}

function createHost(reply: ReplyMock): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;
}

function createReply(sent = false): ReplyMock {
  const reply: ReplyMock = { sent, status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  return reply;
}

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("serializes an AppException with its own status and code", () => {
    const reply = createReply();

    filter.catch(new NotFoundException("Project not found"), createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Project not found",
      code: ErrorCode.NOT_FOUND,
    });
  });

  it("includes field errors for a ValidationException", () => {
    const reply = createReply();
    const errors = { email: ["email must be an email"] };

    filter.catch(new ValidationException(errors), createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Validation failed",
      code: ErrorCode.VALIDATION_FAILED,
      errors,
    });
  });

  it("maps framework HttpExceptions to a matching ErrorCode", () => {
    const reply = createReply();

    filter.catch(new BadRequestException("Bad payload"), createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Bad payload",
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it("hides details of unknown errors behind a generic 500 and logs them", () => {
    const reply = createReply();

    filter.catch(new Error("db password leaked in message"), createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Internal server error",
      code: ErrorCode.INTERNAL_ERROR,
    });
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it("echoes the message of Fastify FST_* errors with a 4xx status (e.g. malformed JSON)", () => {
    const reply = createReply();
    const fastifyError = Object.assign(
      new SyntaxError("Unexpected token in JSON"),
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "FST_ERR_CTP_INVALID_JSON_BODY",
      },
    );

    filter.catch(fastifyError, createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Unexpected token in JSON",
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it.each([
    [HttpStatus.BAD_REQUEST, "Bad request", ErrorCode.BAD_REQUEST],
    [HttpStatus.NOT_FOUND, "Resource not found", ErrorCode.NOT_FOUND],
    [
      HttpStatus.TOO_MANY_REQUESTS,
      "Too many requests",
      ErrorCode.TOO_MANY_REQUESTS,
    ],
  ])(
    "gives other 4xx errors with a statusCode (status %i) a generic message, never the raw one",
    (status, message, code) => {
      const reply = createReply();
      const error = Object.assign(new Error("secret internal detail"), {
        statusCode: status,
      });

      filter.catch(error, createHost(reply));

      expect(reply.status).toHaveBeenCalledWith(status);
      expect(reply.send).toHaveBeenCalledWith({ message, code });
    },
  );

  it("does not write to a reply that was already sent", () => {
    const reply = createReply(true);

    filter.catch(new ServiceUnavailableException(), createHost(reply));

    expect(reply.send).not.toHaveBeenCalled();
  });
});
