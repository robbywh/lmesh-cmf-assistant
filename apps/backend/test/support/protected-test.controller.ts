import { Controller, Get } from "@nestjs/common";

import {
  CurrentUser,
  type CurrentUserData,
} from "../../src/auth/decorators/current-user.decorator";

/** Test-only protected route; registered by the test module, never by AppModule. */
@Controller({ path: "test-protected", version: "1" })
export class ProtectedTestController {
  @Get()
  public whoAmI(@CurrentUser() user: CurrentUserData): {
    id: string;
    email: string;
    name: string;
  } {
    return { id: user.id, email: user.email, name: user.name };
  }
}
