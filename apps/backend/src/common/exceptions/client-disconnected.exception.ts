import { OperationAbortedException } from "./operation-aborted.exception";

/** Abort reason used when the browser closes the connection (Stop, tab closed). Internal only. */
export class ClientDisconnectedException extends OperationAbortedException {
  constructor() {
    super("Client disconnected");
  }
}
