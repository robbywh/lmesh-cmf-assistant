import { ErrorCode, ProjectSchema } from "@lmesh/api-contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api-client";
import { ApiError } from "./api-error";

const project = {
  id: "7b0f4c52-5f7e-4a58-9d3b-0c2f5d1f9a11",
  title: "Alpine",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiRequest", () => {
  it("returns the parsed data of a success envelope", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: project }));

    const result = await apiRequest("getProject", {
      params: { projectId: project.id },
      schema: ProjectSchema,
    });

    expect(result).toEqual(project);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/projects/${project.id}`,
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
  });

  it("sends a JSON body", async () => {
    const fetchMock = stubFetch(jsonResponse({ data: project }, 201));

    await apiRequest("createProject", { body: { title: "Alpine" }, schema: ProjectSchema });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Alpine" }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }),
    );
  });

  it("maps an error envelope to ApiError with code and field errors", async () => {
    stubFetch(
      jsonResponse(
        {
          message: "Validation failed",
          code: ErrorCode.VALIDATION_FAILED,
          errors: { title: ["Required"] },
        },
        400,
      ),
    );

    const error = await apiRequest("createProject", { body: {}, schema: ProjectSchema }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: "Validation failed",
      errors: { title: ["Required"] },
    });
  });

  it("returns undefined for 204", async () => {
    stubFetch(new Response(null, { status: 204 }));

    await expect(
      apiRequest("deleteProject", { params: { projectId: project.id } }),
    ).resolves.toBeUndefined();
  });

  it("throws INTERNAL_ERROR when a success body fails schema parsing", async () => {
    stubFetch(jsonResponse({ data: { id: "nope" } }));

    await expect(
      apiRequest("getProject", { params: { projectId: project.id }, schema: ProjectSchema }),
    ).rejects.toMatchObject({ name: "ApiError", code: ErrorCode.INTERNAL_ERROR });
  });

  it("throws INTERNAL_ERROR for a non-JSON error body", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));

    await expect(apiRequest("listProjects")).rejects.toMatchObject({
      status: 502,
      code: ErrorCode.INTERNAL_ERROR,
    });
  });

  it("throws INTERNAL_ERROR on network failure", async () => {
    stubFetch(new TypeError("Failed to fetch"));

    await expect(apiRequest("listProjects")).rejects.toMatchObject({
      status: 0,
      code: ErrorCode.INTERNAL_ERROR,
    });
  });
});
