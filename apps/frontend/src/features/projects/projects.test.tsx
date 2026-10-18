import { ErrorCode } from "@lmesh/api-contract";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { SEED_PROJECT_IDS } from "@/mocks/fixtures";
import { errorHandler } from "@/mocks/handlers";
import { mockStore, signInMock } from "@/mocks/mock-store";
import { server } from "@/mocks/server";
import { renderApp } from "@/test/render-app";

const EV_TITLE = "Urban EV compact: recycled textiles";

async function openNewProjectDialog(user: ReturnType<typeof userEvent.setup>) {
  const [button] = await screen.findAllByRole("button", { name: "New project" });
  await user.click(button!);
  return screen.findByRole("dialog", { name: "New project" });
}

const sidebarLinks = () => within(screen.getByTestId("project-list")).getAllByRole("link");

describe("sidebar", () => {
  it("lists projects, the user and the empty state", async () => {
    signInMock();
    renderApp("/projects");

    expect(await screen.findByText("Premium SUV interior: warm earth")).toBeInTheDocument();
    expect(sidebarLinks()).toHaveLength(3);
    expect(screen.getAllByText(/^Updated /).length).toBe(3);
    expect(screen.getByText("Test Designer")).toBeInTheDocument();
    expect(screen.getByText("test@lmesh.eu")).toBeInTheDocument();
  });

  it("shows 'No projects yet' for an empty list", async () => {
    signInMock();
    mockStore.projects = [];
    renderApp("/projects");

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("collapses and expands from the toggle", async () => {
    signInMock();
    renderApp("/projects");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Toggle sidebar" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("navigation", { name: "Projects" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(await screen.findByRole("navigation", { name: "Projects" })).toBeInTheDocument();
  });

  it("highlights the active project", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.ev}`);

    const active = await screen.findByRole("link", { name: new RegExp(EV_TITLE) });
    expect(active).toHaveAttribute("data-status", "active");
  });

  it("preloads the project and its conversation on hover", async () => {
    signInMock();
    const requests: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      requests.push(new URL(request.url).pathname);
    };
    server.events.on("request:start", listener);
    renderApp("/projects");
    const user = userEvent.setup();

    await user.hover(await screen.findByRole("link", { name: /Sports coupe/ }));

    await waitFor(() => {
      expect(requests).toContain(`/api/v1/projects/${SEED_PROJECT_IDS.coupe}`);
      expect(requests).toContain(`/api/v1/projects/${SEED_PROJECT_IDS.coupe}/conversations/active`);
    });
    server.events.removeListener("request:start", listener);
  });

  it("preloads on keyboard focus", async () => {
    signInMock();
    const requests: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      requests.push(new URL(request.url).pathname);
    };
    server.events.on("request:start", listener);
    renderApp("/projects");

    const link = await screen.findByRole("link", { name: /Sports coupe/ });
    link.focus();

    await waitFor(() =>
      expect(requests).toContain(`/api/v1/projects/${SEED_PROJECT_IDS.coupe}/conversations/active`),
    );
    server.events.removeListener("request:start", listener);
  });
});

describe("create project", () => {
  it("navigates to the new project, listed first in the sidebar", async () => {
    signInMock();
    renderApp("/projects");
    const user = userEvent.setup();
    await screen.findByText(EV_TITLE);

    const dialog = await openNewProjectDialog(user);
    await user.type(within(dialog).getByLabelText("Title"), "Concept hatch");
    await user.type(within(dialog).getByLabelText("Description"), "Light and airy");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Concept hatch" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sidebarLinks()[0]).toHaveTextContent("Concept hatch");
    expect(await screen.findByText("Project created")).toBeInTheDocument();
  });

  it("shows the created toast when creating from the /projects index button", async () => {
    signInMock();
    renderApp("/projects");
    const user = userEvent.setup();
    await screen.findByText(EV_TITLE);

    const buttons = await screen.findAllByRole("button", { name: "New project" });
    await user.click(buttons.at(-1)!); // the main-area button unmounts when navigating
    const dialog = await screen.findByRole("dialog", { name: "New project" });
    await user.type(within(dialog).getByLabelText("Title"), "From the index");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "From the index" })).toBeInTheDocument();
    expect(await screen.findByText("Project created")).toBeInTheDocument();
  });

  it("shows client-side validation errors on the fields", async () => {
    signInMock();
    renderApp("/projects");
    const user = userEvent.setup();

    const dialog = await openNewProjectDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(within(dialog).getByText("Title is required.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Title")).toBeInvalid();

    await user.click(within(dialog).getByLabelText("Title"));
    await user.paste("x".repeat(121));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      within(dialog).getByText("Title must be at most 120 characters."),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("121/120")).toBeInTheDocument();
  });

  it("maps server validation errors onto the fields", async () => {
    signInMock();
    server.use(
      errorHandler("createProject", 400, ErrorCode.VALIDATION_FAILED, "Validation failed", {
        title: ["Title already in use"],
      }),
    );
    renderApp("/projects");
    const user = userEvent.setup();

    const dialog = await openNewProjectDialog(user);
    await user.type(within(dialog).getByLabelText("Title"), "Duplicate");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Title already in use")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Title")).toBeInvalid();
  });

  it("shows a toast for a non-validation failure", async () => {
    signInMock();
    server.use(errorHandler("createProject", 500, ErrorCode.INTERNAL_ERROR));
    renderApp("/projects");
    const user = userEvent.setup();

    const dialog = await openNewProjectDialog(user);
    await user.type(within(dialog).getByLabelText("Title"), "Anything");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/couldn't save the project/i)).toBeInTheDocument();
  });
});

describe("edit project", () => {
  it("updates the title in the header and the sidebar", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.ev}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit project" });
    const title = within(dialog).getByLabelText("Title");
    expect(title).toHaveValue(EV_TITLE);
    await user.clear(title);
    await user.type(title, "Renamed EV");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "Renamed EV" })).toBeInTheDocument();
    await waitFor(() => expect(sidebarLinks()[0]).toHaveTextContent("Renamed EV"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("delete project", () => {
  it("confirms, navigates to /projects and removes the item", async () => {
    signInMock();
    const { router } = renderApp(`/projects/${SEED_PROJECT_IDS.ev}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete project" });
    expect(dialog).toHaveTextContent(`Delete '${EV_TITLE}'? Its conversations will be deleted too.`);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Select a project or create a new one")).toBeInTheDocument();
    expect(await screen.findByText("Project deleted")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/projects");
    await waitFor(() => expect(sidebarLinks()).toHaveLength(2));
    expect(screen.queryByText(EV_TITLE)).not.toBeInTheDocument();
  });

  it("keeps the project when the dialog is cancelled", async () => {
    signInMock();
    renderApp(`/projects/${SEED_PROJECT_IDS.ev}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete project" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sidebarLinks()).toHaveLength(3);
  });
});

describe("dialog keyboard behaviour", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
  });

  it("traps focus and closes on Escape", async () => {
    signInMock();
    renderApp("/projects");
    const user = userEvent.setup();

    const dialog = await openNewProjectDialog(user);
    for (let i = 0; i < 8; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.tab({ shift: true });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
