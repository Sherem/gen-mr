import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Module under test
import { createGithubProvider } from "../github-provider.mjs";

describe("github-provider validation", () => {
    test("throws when missing githubToken", () => {
        expect(() => createGithubProvider({ githubToken: "" })).toThrow(
            "Missing required githubToken for GitHub utils"
        );
        expect(() => createGithubProvider({})).toThrow(
            "Missing required githubToken for GitHub utils"
        );
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

describe("github-provider HTTP helpers", () => {
    const token = "TOKEN123";
    const gh = createGithubProvider({ githubToken: token });
    test("postToGithub sends POST with headers and body, returns JSON", async () => {
        const payload = { a: 1 };
        const response = { id: 123, ok: true };
        mockFetchOk(response);

        const out = await gh.postToGithub("https://api.github.com/something", payload);

        expect(out).toEqual(response);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe("https://api.github.com/something");
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
        });
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    test("postToGithub throws with response text on error", async () => {
        mockFetchError("Bad Request", 400);
        await expect(gh.postToGithub("https://api.github.com/something", { a: 1 })).rejects.toThrow(
            "Bad Request"
        );
    });

    test("getFromGithub sends GET with headers, returns JSON", async () => {
        const data = { items: [1, 2, 3] };
        mockFetchOk(data);
        const out = await gh.getFromGithub("https://api.github.com/data");
        expect(out).toEqual(data);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("GET");
        expect(init.headers).toMatchObject({
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
        });
        expect(init.body).toBeUndefined();
    });

    test("getFromGithub throws on non-ok", async () => {
        mockFetchError("Not Found", 404);
        await expect(gh.getFromGithub("https://api.github.com/none")).rejects.toThrow("Not Found");
    });

    test("patchToGithub sends PATCH and returns JSON", async () => {
        const payload = { title: "New" };
        const resp = { id: 7, title: "New" };
        mockFetchOk(resp);
        const out = await gh.patchToGithub("https://api.github.com/pulls/1", payload);
        expect(out).toEqual(resp);
        const [, init] = global.fetch.mock.calls[0];
        expect(init.method).toBe("PATCH");
        expect(JSON.parse(init.body)).toEqual(payload);
    });

    test("patchToGithub throws on error", async () => {
        mockFetchError("Update failed", 422);
        await expect(
            gh.patchToGithub("https://api.github.com/pulls/1", { title: "X" })
        ).rejects.toThrow("Update failed");
    });
});

describe("github-provider findExistingPullRequest", () => {
    const repo = "owner/repo";
    const head = "feature-123";
    const base = "main";
    const token = "TTT";
    const gh = createGithubProvider({ githubToken: token });

    test("returns first PR when list is non-empty", async () => {
        const prs = [{ number: 10, html_url: "u" }, { number: 11 }];
        mockFetchOk(prs);
        const pr = await gh.findExistingPullRequest(repo, head, base);
        expect(pr).toEqual(prs[0]);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe(
            `https://api.github.com/repos/${repo}/pulls?state=open&head=${head}&base=${base}`
        );
        expect(init.method).toBe("GET");
        expect(init.headers.Authorization).toBe(`token ${token}`);
    });

    test("returns null when no PRs found", async () => {
        mockFetchOk([]);
        const pr = await gh.findExistingPullRequest(repo, head, base);
        expect(pr).toBeNull();
    });

    test("returns null and warns when request fails", async () => {
        mockFetchError("api down", 500);
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {
            return;
        });
        const pr = await gh.findExistingPullRequest(repo, head, base);
        expect(pr).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
            "Warning: Could not check for existing pull requests:",
            "api down"
        );
        warnSpy.mockRestore();
    });
});

describe("github-provider createOrUpdatePullRequest", () => {
    const baseOpts = {
        githubRepo: "owner/repo",
        sourceBranch: "feature",
        targetBranch: "main",
        title: "My PR",
        description: "Body here",
    };
    const token = "TOK";
    const gh = createGithubProvider({ githubToken: token });

    test("creates a new PR when existingPR not provided", async () => {
        const resp = { number: 5, html_url: "https://gh/pr/5" };
        mockFetchOk(resp);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
            return;
        });
        const out = await gh.createOrUpdatePullRequest({ ...baseOpts, existingPR: null });
        expect(out).toEqual(resp);
        expect(logSpy).toHaveBeenCalledWith("✅ Pull request created:", resp.html_url);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe("https://api.github.com/repos/owner/repo/pulls");
        expect(init.method).toBe("POST");
        const body = JSON.parse(init.body);
        expect(body).toEqual({
            head: baseOpts.sourceBranch,
            base: baseOpts.targetBranch,
            title: baseOpts.title,
            body: baseOpts.description,
        });
        logSpy.mockRestore();
    });

    test("updates an existing PR when existingPR provided", async () => {
        const resp = { number: 7, html_url: "https://gh/pr/7" };
        mockFetchOk(resp);
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {
            return;
        });
        const out = await gh.createOrUpdatePullRequest({ ...baseOpts, existingPR: { number: 7 } });
        expect(out).toEqual(resp);
        expect(logSpy).toHaveBeenCalledWith("✅ Pull request updated:", resp.html_url);
        const [url, init] = global.fetch.mock.calls[0];
        expect(url).toBe("https://api.github.com/repos/owner/repo/pulls/7");
        expect(init.method).toBe("PATCH");
        const body = JSON.parse(init.body);
        expect(body).toEqual({ title: baseOpts.title, body: baseOpts.description });
        logSpy.mockRestore();
    });

    test("logs error and rethrows when create fails", async () => {
        const errMsg = "create failed";
        mockFetchError(errMsg, 400);
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {
            return;
        });
        await expect(
            gh.createOrUpdatePullRequest({ ...baseOpts, existingPR: null })
        ).rejects.toThrow(errMsg);
        expect(errSpy).toHaveBeenCalledWith("❌ Failed to create pull request:", errMsg);
        errSpy.mockRestore();
    });

    test("logs error and rethrows when update fails", async () => {
        const errMsg = "update failed";
        mockFetchError(errMsg, 400);
        const errSpy = jest.spyOn(console, "error").mockImplementation(() => {
            return;
        });
        await expect(
            gh.createOrUpdatePullRequest({ ...baseOpts, existingPR: { number: 42 } })
        ).rejects.toThrow(errMsg);
        expect(errSpy).toHaveBeenCalledWith("❌ Failed to update pull request:", errMsg);
        errSpy.mockRestore();
    });
});
