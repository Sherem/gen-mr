import { describe, test, expect, jest } from "@jest/globals";
import { parseRepoFromRemote, detectRepoType } from "../git-utils.mjs";

// Mock child_process for testing functions that don't execute git commands
jest.mock("child_process", () => ({
    exec: jest.fn(),
}));

describe("git-utils", () => {
    describe("parseRepoFromRemote", () => {
        test("should parse SSH URLs correctly", () => {
            const sshUrl = "git@github.com:owner/repo";
            const result = parseRepoFromRemote(sshUrl);

            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("should parse HTTPS URLs correctly", () => {
            const httpsUrl = "https://github.com/owner/repo";
            const result = parseRepoFromRemote(httpsUrl);

            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("should handle URLs with .git suffix", () => {
            const urlWithGit = "https://github.com/owner/repo.git";
            const result = parseRepoFromRemote(urlWithGit);

            expect(result).toEqual({
                hostname: "github.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("should handle GitLab URLs", () => {
            const gitlabUrl = "https://gitlab.com/owner/repo";
            const result = parseRepoFromRemote(gitlabUrl);

            expect(result).toEqual({
                hostname: "gitlab.com",
                fullName: "owner/repo",
                owner: "owner",
                name: "repo",
            });
        });

        test("should throw error for invalid URLs", () => {
            const invalidUrl = "invalid-url";
            expect(() => parseRepoFromRemote(invalidUrl)).toThrow("Unable to parse repository URL");
        });
    });

    describe("detectRepoType", () => {
        test("should detect GitHub correctly", () => {
            expect(detectRepoType("github.com")).toBe("github");
            expect(detectRepoType("GITHUB.COM")).toBe("github");
        });

        test("should detect GitLab correctly", () => {
            expect(detectRepoType("gitlab.com")).toBe("gitlab");
            expect(detectRepoType("gitlab.example.com")).toBe("gitlab");
            expect(detectRepoType("my-gitlab.company.com")).toBe("gitlab");
        });

        test("should return unknown for other hostnames", () => {
            expect(detectRepoType("bitbucket.org")).toBe("unknown");
            expect(detectRepoType("example.com")).toBe("unknown");
        });
    });
});
