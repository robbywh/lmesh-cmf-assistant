import { ErrorCode, ProjectListSchema } from "@lmesh/api-contract";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiRequest } from "@/lib/api-client";
import { mockStore, signInMock } from "@/mocks/mock-store";
import { route } from "@/mocks/handlers";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

async function submitCredentials(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("login", () => {
  it("navigates to the redirect target after valid credentials", async () => {
    const { router } = renderApp("/login?redirect=/projects");

    await submitCredentials("test@lmesh.eu", "password");

    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects");
  });

  it("shows the generic alert for invalid credentials", async () => {
    renderApp("/login");

    await submitCredentials("test@lmesh.eu", "wrong-password");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("shows the rate-limit alert on 429", async () => {
    server.use(
      route("signIn", () =>
        HttpResponse.json({ message: "Too many requests. Please try again later." }, { status: 429 }),
      ),
    );
    renderApp("/login");

    await submitCredentials("test@lmesh.eu", "password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/too many sign-in attempts/i);
  });

  it("shows a network error message when the server is unreachable", async () => {
    server.use(route("signIn", () => HttpResponse.error()));
    renderApp("/login");

    await submitCredentials("test@lmesh.eu", "password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't reach the server/i);
  });

  it("validates the fields before calling the server", async () => {
    renderApp("/login");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sign in" }));

    expect(screen.getByLabelText("Email")).toBeInvalid();
    expect(screen.getByLabelText("Password")).toBeInvalid();
    expect(mockStore.signedIn).toBe(false);
  });

  it("ignores an absolute external redirect", async () => {
    const { router } = renderApp("/login?redirect=https://evil.example/steal");

    await submitCredentials("test@lmesh.eu", "password");

    await screen.findByRole("heading", { name: "Projects" });
    expect(router.state.location.href).toBe("/projects");
  });

  it("ignores a protocol-relative redirect", async () => {
    const { router } = renderApp("/login?redirect=//evil.example");

    await submitCredentials("test@lmesh.eu", "password");

    await screen.findByRole("heading", { name: "Projects" });
    expect(router.state.location.href).toBe("/projects");
  });

  it("redirects to /projects when already signed in", async () => {
    signInMock();
    const { router } = renderApp("/login");

    await screen.findByRole("heading", { name: "Projects" });
    expect(router.state.location.pathname).toBe("/projects");
  });
});

describe("protected routes", () => {
  it("redirects to /login with the original path while signed out", async () => {
    const { router } = renderApp("/projects");

    await screen.findByRole("button", { name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/projects" });
  });

  it("redirects / to /projects", async () => {
    signInMock();
    renderApp("/");

    expect(await screen.findByText("Select a project or create a new one")).toBeInTheDocument();
  });

  it("clears the cache and lands on /login after a 401 from a project request", async () => {
    signInMock();
    const { queryClient, router } = renderApp("/projects");
    await screen.findByRole("heading", { name: "Projects" });

    mockStore.signedIn = false;
    await queryClient
      .fetchQuery({
        queryKey: ["projects", "probe"],
        staleTime: 0,
        queryFn: () => apiRequest("listProjects", { schema: ProjectListSchema }),
      })
      .catch((error: unknown) => expect(error).toMatchObject({ code: ErrorCode.UNAUTHORIZED }));

    await screen.findByRole("button", { name: "Sign in" });
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/projects" });
    expect(queryClient.getQueryCache().find({ queryKey: ["projects", "probe"] })).toBeUndefined();
  });
});

describe("sign out", () => {
  it("lands on /login and clears the cache", async () => {
    signInMock();
    const { router, queryClient } = renderApp("/projects");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sign out" }));

    await screen.findByRole("button", { name: "Sign in" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(mockStore.signedIn).toBe(false);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1); // only the fresh session probe
  });
});
