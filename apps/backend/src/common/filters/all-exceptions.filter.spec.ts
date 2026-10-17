import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
} from "@nestjs/common";

import {
  ErrorCode,
  NotFoundException,
  ServiceUnavailableException,
  ValidationException,
} from "../exceptions";
import { AllExceptionsFilter } from "./all-exceptions.filter";

interface ReplyMock {
  sent: boolean;
  status: jest.Mock;
  send: jest.Mock;
}

function createHost(reply: ReplyMock): ArgumentsHost {
  return {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as unknown as ArgumentsHost;
}

function createReply(sent = false): ReplyMock {
  const reply: ReplyMock = { sent, status: jest.fn(), send: jest.fn() };
  reply.status.mockReturnValue(reply);
  return reply;
}

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

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

  it("passes through 4xx framework errors that carry a statusCode (e.g. malformed JSON)", () => {
    const reply = createReply();
    const fastifyError = Object.assign(
      new SyntaxError("Unexpected token in JSON"),
      {
        statusCode: HttpStatus.BAD_REQUEST,
      },
    );

    filter.catch(fastifyError, createHost(reply));

    expect(reply.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(reply.send).toHaveBeenCalledWith({
      message: "Unexpected token in JSON",
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it("does not write to a reply that was already sent", () => {
    const reply = createReply(true);

    filter.catch(new ServiceUnavailableException(), createHost(reply));

    expect(reply.send).not.toHaveBeenCalled();
  });
});
