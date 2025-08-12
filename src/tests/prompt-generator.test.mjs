import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import {
    generateMergeRequestPrompt,
    generateDefaultPrompt,
    generateMinimalPrompt,
    generateComprehensivePrompt,
} from "../prompt-generator.mjs";

// Mock git-provider module
jest.mock("../git-provider/git-provider.mjs", () => ({
    getGitDiff: jest.fn(),
    getCommitMessages: jest.fn(),
    getChangedFiles: jest.fn(),
    getChangedFilesByType: jest.fn(),
}));

import {
    getGitDiff,
    getCommitMessages,
    getChangedFiles,
    getChangedFilesByType,
} from "../git-provider/git-provider.mjs";

describe("prompt-generator", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("generateMergeRequestPrompt", () => {
        test("should generate basic prompt with branch names", async () => {
            // Mock git functions to return empty results
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).toContain(
                "Generate a professional merge request title and description for merging 'feature-branch' into 'main'"
            );
            expect(result).toContain("Please provide:");
            expect(result).toContain("1. A concise, descriptive title for the merge request");
            expect(result).toContain("2. A detailed description that includes:");
        });

        test("should include JIRA tickets when provided", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt(
                "feature-branch",
                "main",
                "PROJ-123,PROJ-456"
            );

            expect(result).toContain("Related JIRA tickets: PROJ-123,PROJ-456");
        });

        test("should include commit messages when available", async () => {
            getCommitMessages.mockResolvedValue(["Add new feature", "Fix bug in component"]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).toContain("Commit messages:");
            expect(result).toContain("- Add new feature");
            expect(result).toContain("- Fix bug in component");
        });

        test("should omit commit section when commits is null", async () => {
            // Simulate git util returning null (not an array) without throwing
            getCommitMessages.mockResolvedValue(null);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(getCommitMessages).toHaveBeenCalled();
            expect(result).not.toContain("Commit messages:");
            expect(result).not.toContain("Commit messages: No commit messages found.");
        });

        test("should include changed files when available", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue(["src/component.js", "src/utils.js"]); // fallback
            getChangedFilesByType.mockResolvedValue({
                added: ["src/component.js"],
                modified: ["src/utils.js"],
                deleted: ["src/old-file.js"],
            });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).toContain("Changed files:");
            expect(result).toContain("Added:");
            expect(result).toContain("Modified:");
            expect(result).toContain("- src/component.js");
            expect(result).toContain("- src/utils.js");
        });

        test("should include git diff when available", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("+ added line\n- removed line");

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).toContain("Code changes");
            expect(result).toContain("```diff");
            expect(result).toContain("+ added line");
            expect(result).toContain("- removed line");
        });

        test("should omit diff section when diff is null", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue(null); // explicit null

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).not.toContain("Code changes");
            expect(result).not.toContain("```diff");
        });

        test("should include additional instructions when provided", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main", "", {
                additionalInstructions: "Please emphasize security improvements",
            });

            expect(result).toContain("Additional instructions from user:");
            expect(result).toContain("Please emphasize security improvements");
        });

        test("should not include commit messages when disabled", async () => {
            getCommitMessages.mockResolvedValue(["This should not appear"]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main", "", {
                includeCommitMessages: false,
                includeChangedFiles: false,
                includeGitDiff: false,
            });

            expect(result).not.toContain("Commit messages:");
            expect(getCommitMessages).not.toHaveBeenCalled();
        });

        test("should not include changed files when disabled", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue(["a.js"]);
            getChangedFilesByType.mockResolvedValue({ added: ["a.js"], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main", "", {
                includeChangedFiles: false,
                includeCommitMessages: false,
                includeGitDiff: false,
            });

            expect(result).not.toContain("Changed files:");
            expect(getChangedFilesByType).not.toHaveBeenCalled();
        });

        test("should not include JIRA tickets when empty", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main", "");
            expect(result).not.toContain("Related JIRA tickets:");
        });

        test("should include previous result context when regenerating", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getGitDiff.mockResolvedValue("");

            const previousResult = {
                title: "Previous Title",
                description: "Previous Description",
            };

            const result = await generateMergeRequestPrompt("feature-branch", "main", "", {
                previousResult,
            });

            expect(result).toContain("Previous merge request details:");
            expect(result).toContain("Title: Previous Title");
            expect(result).toContain("Description: Previous Description");
        });

        test("should handle git errors gracefully", async () => {
            getCommitMessages.mockRejectedValue(new Error("Git error"));
            getChangedFiles.mockRejectedValue(new Error("Git error"));
            getChangedFilesByType.mockRejectedValue(new Error("Git error"));
            getGitDiff.mockRejectedValue(new Error("Git error"));

            const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {
                return;
            });

            const result = await generateMergeRequestPrompt("feature-branch", "main");

            expect(result).toContain("Generate a professional merge request title and description");
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("Warning: Could not gather git context:")
            );

            consoleSpy.mockRestore();
        });

        test("should respect maxDiffLines option", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("line1\nline2\nline3\nline4\nline5");

            const result = await generateMergeRequestPrompt("feature-branch", "main", "", {
                maxDiffLines: 3,
            });

            expect(result).toContain("showing first 3 lines");
            expect(result).toContain("... (diff truncated for brevity)");
        });
    });

    describe("generateDefaultPrompt", () => {
        test("should call generateMergeRequestPrompt with default options", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            const result = await generateDefaultPrompt("feature-branch", "main", "PROJ-123");

            expect(result).toContain("Generate a professional merge request title and description");
            expect(result).toContain("Related JIRA tickets: PROJ-123");
        });

        test("should not include JIRA tickets when empty or omitted", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("");

            // Omit third arg entirely
            const result = await generateDefaultPrompt("feature-branch", "main");

            expect(result).toContain("Generate a professional merge request title and description");
            expect(result).not.toContain("Related JIRA tickets:");
        });
    });

    describe("generateMinimalPrompt", () => {
        test("should generate prompt without git diff", async () => {
            getCommitMessages.mockResolvedValue(["Test commit"]);
            getChangedFiles.mockResolvedValue(["file.js"]);
            getChangedFilesByType.mockResolvedValue({
                added: ["file.js"],
                modified: [],
                deleted: [],
            });
            getGitDiff.mockResolvedValue("some diff");

            const result = await generateMinimalPrompt("feature-branch", "main");

            expect(result).toContain("Commit messages:");
            expect(result).toContain("Changed files:");
            expect(result).not.toContain("Code changes");
            expect(result).not.toContain("```diff");
        });
    });

    describe("generateComprehensivePrompt", () => {
        test("should generate prompt with extended diff", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFiles.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getGitDiff.mockResolvedValue("comprehensive diff content");

            const result = await generateComprehensivePrompt("feature-branch", "main");

            expect(result).toContain("showing first 2000 lines");
        });

        test("should fallback to flat changed files list when classification unavailable (non-empty)", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue(null); // triggers fallback branch
            getChangedFiles.mockResolvedValue(["src/a.js", "src/b.js"]);
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");
            expect(result).toContain("Changed files:");
            expect(result).toContain("- src/a.js");
            expect(result).toContain("- src/b.js");
        });

        test("should fallback and show no changed files when classification unavailable and flat list empty", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue(null); // triggers fallback branch
            getChangedFiles.mockResolvedValue([]);
            getGitDiff.mockResolvedValue("");

            const result = await generateMergeRequestPrompt("feature-branch", "main");
            expect(result).toContain("Changed files: No changed files found.");
        });

        test("should show 'No code changes found' when diff is empty string", async () => {
            getCommitMessages.mockResolvedValue([]);
            getChangedFilesByType.mockResolvedValue({ added: [], modified: [], deleted: [] });
            getChangedFiles.mockResolvedValue([]);
            getGitDiff.mockResolvedValue(""); // empty diff triggers else-if path

            const result = await generateMergeRequestPrompt("feature-branch", "main");
            expect(result).toContain("Code changes: No code changes found.");
        });

        test("should apply default empty arrays when filesByType missing keys", async () => {
            getCommitMessages.mockResolvedValue([]);
            // Provide object missing arrays to hit destructuring defaults
            getChangedFilesByType.mockResolvedValue({});
            getChangedFiles.mockResolvedValue([]);
            getGitDiff.mockResolvedValue("+ line1");

            const result = await generateMergeRequestPrompt("feature-branch", "main");
            expect(result).toContain("Changed files: No changed files found.");
        });
    });
});
