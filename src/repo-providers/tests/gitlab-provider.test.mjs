import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Module under test
import { createGitlabProvider } from "../gitlab-provider.mjs";

describe("gitlab-provider validation", () => {
    test("throws when missing gitlabToken", () => {
        expect(() => createGitlabProvider({ gitlabToken: "" })).toThrow(
            "Missing required gitlabToken for GitLab utils"
        );
        expect(() => createGitlabProvider({})).toThrow(
            "Missing required gitlabToken for GitLab utils"
        );
    });

    test("uses default gitlab.com host when not specified", () => {
        const gl = createGitlabProvider({ gitlabToken: "token123" });
        expect(gl).toBeDefined();
    });

    test("accepts custom GitLab host", () => {
        const gl = createGitlabProvider({
            gitlabToken: "token123",
            gitlabHost: "gitlab.example.com",
        });
        expect(gl).toBeDefined();
    });
});

// Ensure we can mock fetch in Node test environment
beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
});

const mockFetchOk = (data) => {
    global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => JSON.stringify(data),
    });
};

const mockFetchError = (message = "boom", status = 400) => {
    global.fetch.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ message }),
        text: async () => message,
    });
};

describe("gitlab-provider HTTP helpers", () => {
    const token = "TOKEN123";
    const gl = createGitlabProvider({ gitlabToken: token });

    test("postToRemoteRepo sends POST with headers and body, returns JSON", async () => {
        const payload = { a: 1 };
        const response = { id: 123, ok: true };
        mockFetchOk(response);

        const out = await gl.postToRemoteRepo("https://gitlab.com/api/v4/something", payload);

        expect(out).toEqual(response);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe("https://gitlab.com/api/v4/something");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        });
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    test("postToRemoteRepo throws with response text on error", async () => {
        mockFetchError("Bad Request", 400);
        await expect(
            gl.postToRemoteRepo("https://gitlab.com/api/v4/something", { a: 1 })
        ).rejects.toThrow("Bad Request");
    });

    test("getFromRemoteRepo sends GET with headers, returns JSON", async () => {
        const data = { items: [1, 2, 3] };
        mockFetchOk(data);
        const out = await gl.getFromRemoteRepo("https://gitlab.com/api/v4/data");
        expect(out).toEqual(data);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("GET");
        expect(init.headers).toMatchObject({
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        });
        expect(init.body).toBeUndefined();
    });

    test("getFromRemoteRepo throws on non-ok", async () => {
        mockFetchError("Not Found", 404);
        await expect(gl.getFromRemoteRepo("https://gitlab.com/api/v4/none")).rejects.toThrow(
            "Not Found"
        );
    });

    test("patchAtRemoteRepo sends PUT and returns JSON", async () => {
        const payload = { title: "New" };
        const resp = { id: 7, title: "New" };
        mockFetchOk(resp);
        const out = await gl.patchAtRemoteRepo(
            "https://gitlab.com/api/v4/merge_requests/1",
            payload
        );
        expect(out).toEqual(resp);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("PUT");
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    test("patchAtRemoteRepo throws on error", async () => {
        mockFetchError("Update failed", 422);
        await expect(
            gl.patchAtRemoteRepo("https://gitlab.com/api/v4/merge_requests/1", { title: "X" })
        ).rejects.toThrow("Update failed");
    });
});

describe("gitlab-provider findExistingMergeRequest", () => {
    const repo = "owner/repo";
    const sourceBranch = "feature-123";
    const targetBranch = "main";
    const token = "TTT";
    const gl = createGitlabProvider({ gitlabToken: token });

    test("returns first MR when list is non-empty", async () => {
        const mrs = [{ iid: 10, web_url: "u" }, { iid: 11 }];
        mockFetchOk(mrs);
        const mr = await gl.findExistingMergeRequest(repo, sourceBranch, targetBranch);
        expect(mr).toEqual({
            ...mrs[0],
            html_url: mrs[0].web_url,
            body: mrs[0].description,
        });
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe(
            `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}/merge_requests?state=opened&source_branch=${sourceBranch}&target_branch=${targetBranch}`
        );
        expect(init.method).toBe("GET");
        expect(init.headers.Authorization).toBe(`Bearer ${token}`);
    });

    test("returns null when no MRs found", async () => {
        mockFetchOk([]);
        const mr = await gl.findExistingMergeRequest(repo, sourceBranch, targetBranch);
        expect(mr).toBeNull();
    });

    test("maps GitLab fields to workflow-expected format", async () => {
        const mrFromGitlab = {
            iid: 123,
            title: "Test MR Title",
            description: "This is the MR description",
            web_url: "https://gitlab.com/owner/repo/-/merge_requests/123",
            state: "opened",
            source_branch: "feature",
            target_branch: "main",
        };
        mockFetchOk([mrFromGitlab]);
        const mr = await gl.findExistingMergeRequest(repo, sourceBranch, targetBranch);
        expect(mr).toEqual({
            ...mrFromGitlab,
            html_url: mrFromGitlab.web_url, // Added for workflow compatibility
            body: mrFromGitlab.description, // Added for workflow compatibility
        });
    });

    test("returns null and warns when request fails", async () => {
        mockFetchError("api down", 500);
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {
            return;
        });
        const mr = await gl.findExistingMergeRequest(repo, sourceBranch, targetBranch);
        expect(mr).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            "Warning: Could not check for existing merge requests:",
            "api down"
        );
        warnSpy.mockRestore();
    });
});

describe("gitlab-provider createOrUpdateMergeRequest", () => {
    const baseOpts = {
        repository: "owner/repo",
        sourceBranch: "feature",
        targetBranch: "main",
        title: "My MR",
        description: "Body here",
    };
    const token = "TOK";
    const gl = createGitlabProvider({ gitlabToken: token });

    test("creates a new MR when existingMR not provided", async () => {
        const resp = { iid: 5, web_url: "https://gitlab.com/mr/5" };
        mockFetchOk(resp);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
            return;
        });
        const out = await gl.createOrUpdateMergeRequest({ ...baseOpts, existingRequest: null });
        expect(out).toEqual(resp);
        expect(logSpy).toHaveBeenCalledWith("✅ Merge request created:", resp.web_url);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe(
            `https://gitlab.com/api/v4/projects/${encodeURIComponent(baseOpts.repository)}/merge_requests`
        );
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body);
        expect(body).toEqual({
            source_branch: baseOpts.sourceBranch,
            target_branch: baseOpts.targetBranch,
            title: baseOpts.title,
            description: baseOpts.description,
        });
        logSpy.mockRestore();
    });

    test("updates an existing MR when existingMR provided", async () => {
        const resp = { iid: 7, web_url: "https://gitlab.com/mr/7" };
        mockFetchOk(resp);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
            return;
        });
        const out = await gl.createOrUpdateMergeRequest({
            ...baseOpts,
            existingRequest: { iid: 7 },
        });
        expect(out).toEqual(resp);
        expect(logSpy).toHaveBeenCalledWith("✅ Merge request updated:", resp.web_url);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe(
            `https://gitlab.com/api/v4/projects/${encodeURIComponent(baseOpts.repository)}/merge_requests/7`
        );
        expect(init.method).toBe("PUT");
        const body = JSON.parse(init.body);
        expect(body).toEqual({ title: baseOpts.title, description: baseOpts.description });
        logSpy.mockRestore();
    });

    test("logs error and rethrows when create fails", async () => {
        const errMsg = "create failed";
        mockFetchError(errMsg, 400);
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {
            return;
        });
        await expect(
            gl.createOrUpdateMergeRequest({ ...baseOpts, existingRequest: null })
        ).rejects.toThrow(errMsg);
        expect(errSpy).toHaveBeenCalledWith("❌ Failed to create merge request:", errMsg);
        errSpy.mockRestore();
    });

    test("logs error and rethrows when update fails", async () => {
        const errMsg = "update failed";
        mockFetchError(errMsg, 400);
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {
            return;
        });
        await expect(
            gl.createOrUpdateMergeRequest({ ...baseOpts, existingRequest: { iid: 42 } })
        ).rejects.toThrow(errMsg);
        expect(errSpy).toHaveBeenCalledWith("❌ Failed to update merge request:", errMsg);
        errSpy.mockRestore();
    });

    test("works with custom GitLab host", async () => {
        const customHost = "gitlab.example.com";
        const customGl = createGitlabProvider({ gitlabToken: token, gitlabHost: customHost });
        const resp = { iid: 5, web_url: `https://${customHost}/mr/5` };
        mockFetchOk(resp);

        await customGl.createOrUpdateMergeRequest({ ...baseOpts, existingRequest: null });

        const [url] = global.fetch.mock.calls[0];
        expect(url).toBe(
            `https://${customHost}/api/v4/projects/${encodeURIComponent(baseOpts.repository)}/merge_requests`
        );
    });
});
