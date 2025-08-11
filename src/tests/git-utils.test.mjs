import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Classic Jest mock compatible with Babel transform
jest.mock("child_process", () => {
    const execFn = jest.fn();
    // Make promisify(exec) resolve to { stdout, stderr } matching Node's exec
    const kPromisify = Symbol.for("nodejs.util.promisify.custom");
    execFn[kPromisify] = (cmd) =>
        new Promise((resolve, reject) => {
            execFn(cmd, (err, stdout, stderr) => {
                if (err) return reject(err);
                resolve({ stdout, stderr });
            });
        });
    return { exec: execFn };
});
import { exec as execMock } from "child_process";
import * as gitUtils from "../git-utils.mjs";

beforeEach(() => {
    execMock.mockReset();
});

const callWith =
    (stdout = "", stderr = "") =>
        (cmd, optionsOrCb, maybeCb) => {
            const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
            cb(null, stdout, stderr);
        };

const callError =
    (message = "boom") =>
        (cmd, optionsOrCb, maybeCb) => {
            const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
            cb(new Error(message));
        };

describe("git-utils", () => {
    describe("getUpstreamRef", () => {
        test("returns upstream ref when configured", async () => {
            execMock.mockImplementation(callWith("origin/feature-x\n"));
            const ref = await gitUtils.getUpstreamRef("feature-x");
            expect(ref).toBe("origin/feature-x");
            expect(execMock).toHaveBeenCalledWith(
                "git rev-parse --abbrev-ref feature-x@{u}",
                expect.any(Function)
            );
        });

        test("returns null when no upstream configured", async () => {
            execMock.mockImplementation(callError("no upstream"));
            const ref = await gitUtils.getUpstreamRef("feature-x");
            expect(ref).toBeNull();
        });
    });

    describe("fetchRemote", () => {
        test("fetches successfully", async () => {
            execMock.mockImplementation(callWith(""));
            await expect(gitUtils.fetchRemote("origin")).resolves.toBeUndefined();
            expect(execMock).toHaveBeenCalledWith("git fetch origin --quiet", expect.any(Function));
        });

        test("throws on fetch error", async () => {
            execMock.mockImplementation(callError("fetch failed"));
            await expect(gitUtils.fetchRemote("origin")).rejects.toThrow(
                "Failed to fetch remote: fetch failed"
            );
        });
    });

    describe("getAheadBehind", () => {
        test("parses behind and ahead counts", async () => {
            execMock.mockImplementation(callWith("2 3\n"));
            const res = await gitUtils.getAheadBehind("origin/feat", "feat");
            expect(res).toEqual({ behind: 2, ahead: 3 });
            expect(execMock).toHaveBeenCalledWith(
                "git rev-list --left-right --count origin/feat...feat",
                expect.any(Function)
            );
        });

        test("handles single number and whitespace variations", async () => {
            execMock.mockImplementation(callWith("0    0\n"));
            const res = await gitUtils.getAheadBehind("origin/feat", "feat");
            expect(res).toEqual({ behind: 0, ahead: 0 });
        });

        test("returns zeros when stdout is empty", async () => {
            execMock.mockImplementation(callWith("\n"));
            const res = await gitUtils.getAheadBehind("origin/feat", "feat");
            expect(res).toEqual({ behind: 0, ahead: 0 });
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("compare failed"));
            await expect(gitUtils.getAheadBehind("origin/feat", "feat")).rejects.toThrow(
                "Failed to compare with upstream: compare failed"
            );
        });
    });
    describe("parseRepoFromRemote", () => {
        test("parses SSH URLs", () => {
            const sshUrl = "git@github.com:owner/repo";
            const result = gitUtils.parseRepoFromRemote(sshUrl);
            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("parses HTTPS URLs", () => {
            const httpsUrl = "https://github.com/owner/repo";
            const result = gitUtils.parseRepoFromRemote(httpsUrl);
            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("handles .git suffix", () => {
            const urlWithGit = "https://github.com/owner/repo.git";
            const result = gitUtils.parseRepoFromRemote(urlWithGit);
            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("handles GitLab URLs", () => {
            const gitlabUrl = "https://gitlab.com/owner/repo";
            const result = gitUtils.parseRepoFromRemote(gitlabUrl);
            expect(result).toEqual({
                hostname: "gitlab.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("throws on invalid URLs", () => {
            expect(() => gitUtils.parseRepoFromRemote("invalid-url")).toThrow(
                "Unable to parse repository URL"
            );
        });
    });

    describe("detectRepoType", () => {
        test("detects GitHub", () => {
            expect(gitUtils.detectRepoType("github.com")).toBe("github");
            expect(gitUtils.detectRepoType("GITHUB.COM")).toBe("github");
        });

        test("detects GitLab", () => {
            expect(gitUtils.detectRepoType("gitlab.com")).toBe("gitlab");
            expect(gitUtils.detectRepoType("gitlab.example.com")).toBe("gitlab");
            expect(gitUtils.detectRepoType("my-gitlab.company.com")).toBe("gitlab");
        });

        test("returns unknown for others", () => {
            expect(gitUtils.detectRepoType("bitbucket.org")).toBe("unknown");
            expect(gitUtils.detectRepoType("example.com")).toBe("unknown");
        });
    });

    describe("getGitDiff", () => {
        test("returns trimmed diff", async () => {
            execMock.mockImplementation((cmd, optionsOrCb, maybeCb) => {
                const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
                expect(cmd).toBe("git diff main...feature");
                cb(null, "some diff output\n", "");
            });
            const out = await gitUtils.getGitDiff("feature", "main");
            expect(out).toBe("some diff output");
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("diff error"));
            await expect(gitUtils.getGitDiff("a", "b")).rejects.toThrow(
                "Failed to get git diff: diff error"
            );
        });
    });

    describe("getCommitMessages", () => {
        test("returns non-empty lines", async () => {
            execMock.mockImplementation(callWith("feat: one\n\nfix: two\n"));
            const msgs = await gitUtils.getCommitMessages("feature", "main");
            expect(msgs).toEqual(["feat: one", "fix: two"]);
            expect(execMock).toHaveBeenCalled();
            expect(execMock.mock.calls[0][0]).toBe('git log main..feature --pretty=format:"%s"');
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("log failed"));
            await expect(gitUtils.getCommitMessages("a", "b")).rejects.toThrow(
                "Failed to get commit messages: log failed"
            );
        });
    });

    describe("getChangedFiles", () => {
        test("returns file list without empties", async () => {
            execMock.mockImplementation(callWith("a.js\n\nb.md\n"));
            const files = await gitUtils.getChangedFiles("feature", "main");
            expect(files).toEqual(["a.js", "b.md"]);
            expect(execMock.mock.calls[0][0]).toBe("git diff --name-only main...feature");
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("name-only failed"));
            await expect(gitUtils.getChangedFiles("a", "b")).rejects.toThrow(
                "Failed to get changed files: name-only failed"
            );
        });
    });

    describe("getRepoInfo", () => {
        test("returns remoteUrl and repoName", async () => {
            execMock.mockImplementation((cmd, optionsOrCb, maybeCb) => {
                const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
                if (cmd === "git config --get remote.origin.url") {
                    cb(null, "git@github.com:owner/repo.git\n", "");
                } else if (cmd === "git rev-parse --show-toplevel") {
                    cb(null, "/Users/u/work/repo\n", "");
                } else {
                    cb(new Error(`unexpected: ${cmd}`));
                }
            });

            const info = await gitUtils.getRepoInfo();
            expect(info).toEqual({ remoteUrl: "git@github.com:owner/repo.git", repoName: "repo" });
        });

        test("throws on error", async () => {
            execMock.mockImplementation(callError("cfg failed"));
            await expect(gitUtils.getRepoInfo()).rejects.toThrow(
                "Failed to get repository info: cfg failed"
            );
        });
    });

    describe("getOriginRemote", () => {
        test("returns origin remote", async () => {
            execMock.mockImplementation(callWith("https://github.com/owner/repo.git\n"));
            const url = await gitUtils.getOriginRemote();
            expect(url).toBe("https://github.com/owner/repo.git");
            expect(execMock.mock.calls[0][0]).toBe("git config --get remote.origin.url");
        });

        test("throws on error", async () => {
            execMock.mockImplementation(callError("no remote"));
            await expect(gitUtils.getOriginRemote()).rejects.toThrow(
                "Failed to get origin remote: no remote"
            );
        });
    });

    describe("getCommitSha", () => {
        test("returns commit sha for ref", async () => {
            execMock.mockImplementation(callWith("abcdef1234567890\n"));
            const sha = await gitUtils.getCommitSha("HEAD");
            expect(sha).toBe("abcdef1234567890");
            expect(execMock).toHaveBeenCalledWith("git rev-parse HEAD", expect.any(Function));
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("rev-parse failed"));
            await expect(gitUtils.getCommitSha("main")).rejects.toThrow(
                "Failed to get commit SHA for 'main': rev-parse failed"
            );
        });
    });

    describe("getRepositoryFromRemote", () => {
        test("detects from specific remote (origin)", async () => {
            execMock.mockImplementation(callWith("git@github.com:owner/repo.git\n"));
            const repo = await gitUtils.getRepositoryFromRemote("origin");
            expect(repo).toEqual({
                type: "github",
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
                remoteUrl: "git@github.com:owner/repo.git",
            });
        });

        test("detects from non-origin remote (upstream)", async () => {
            execMock.mockImplementation(callWith("https://gitlab.com/group/proj.git\n"));
            const repo = await gitUtils.getRepositoryFromRemote("upstream");
            expect(repo).toEqual({
                type: "gitlab",
                hostname: "gitlab.com",
                fullName: "group/proj",
                owner: "group",
                name: "proj",
                remoteUrl: "https://gitlab.com/group/proj.git",
            });
        });

        test("handles error", async () => {
            execMock.mockImplementation(callError("bad remote"));
            await expect(gitUtils.getRepositoryFromRemote("origin")).rejects.toThrow(
                "Failed to detect repository from remote: Failed to get remote 'origin' url: bad remote"
            );
        });
    });

    describe("validateGitContext", () => {
        test("passes when repo and branches exist", async () => {
            execMock.mockImplementation((cmd, optionsOrCb, maybeCb) => {
                const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
                if (
                    cmd === "git rev-parse --git-dir" ||
                    cmd === "git rev-parse --verify feature" ||
                    cmd === "git rev-parse --verify main"
                ) {
                    cb(null, "", "");
                } else {
                    cb(new Error(`unexpected: ${cmd}`));
                }
            });
            await expect(gitUtils.validateGitContext("feature", "main")).resolves.toBe(true);
        });

        test("fails when not a git repo", async () => {
            execMock.mockImplementation((cmd, optionsOrCb, maybeCb) => {
                const cb = typeof optionsOrCb === "function" ? optionsOrCb : maybeCb;
                if (cmd === "git rev-parse --git-dir") {
                    cb(new Error("not a repo"));
                } else {
                    cb(null, "", "");
                }
            });
            await expect(gitUtils.validateGitContext("feature", "main")).rejects.toThrow(
                "Git validation failed: not a repo"
            );
        });
    });

    describe("branchesHaveDifferences", () => {
        test("true when count > 0", async () => {
            execMock.mockImplementation(callWith("2\n"));
            await expect(gitUtils.branchesHaveDifferences("feature", "main")).resolves.toBe(true);
            expect(execMock.mock.calls[0][0]).toBe("git rev-list --count main..feature");
        });

        test("false when count = 0", async () => {
            execMock.mockImplementation(callWith("0\n"));
            await expect(gitUtils.branchesHaveDifferences("feature", "main")).resolves.toBe(false);
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("rev-list failed"));
            await expect(gitUtils.branchesHaveDifferences("feature", "main")).rejects.toThrow(
                "Failed to check branch differences: rev-list failed"
            );
        });
    });

    describe("getCurrentBranch", () => {
        test("returns current branch name", async () => {
            execMock.mockImplementation(callWith("feature-xyz\n"));
            await expect(gitUtils.getCurrentBranch()).resolves.toBe("feature-xyz");
            expect(execMock).toHaveBeenCalled();
            expect(execMock.mock.calls[0][0]).toBe("git rev-parse --abbrev-ref HEAD");
        });

        test("throws on exec error", async () => {
            execMock.mockImplementation(callError("branch failed"));
            await expect(gitUtils.getCurrentBranch()).rejects.toThrow(
                "Failed to get current branch: branch failed"
            );
        });
    });
});
