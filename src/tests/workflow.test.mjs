import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { executePRWorkflow } from "../workflow.mjs";

// Readline mock
let mockAnswers = [];
let mockRlClose;
const setMockAnswers = (arr) => {
    mockAnswers = [...arr];
};
jest.mock("readline", () => ({
    createInterface: jest.fn(() => {
        mockRlClose = jest.fn();
        const local = [...mockAnswers];
        return {
            question: (q, cb) => cb(local.length ? local.shift() : ""),
            close: mockRlClose,
        };
    }),
}));

// Mocks with mock* naming so Jest allows closure usage
const mockGetEditorCommand = jest.fn();
const mockEditPullRequestContent = jest.fn();
const mockOpenInEditor = jest.fn();
jest.mock("../config/common.mjs", () => ({
    getEditorCommand: (...a) => mockGetEditorCommand(...a),
    editPullRequestContent: (...a) => mockEditPullRequestContent(...a),
    openInEditor: (...a) => mockOpenInEditor(...a),
}));

const mockValidatePRInputAndBranches = jest.fn();
jest.mock("../config/validation.mjs", () => ({
    validatePRInputAndBranches: (...a) => mockValidatePRInputAndBranches(...a),
}));

const mockFindExistingPullRequest = jest.fn();
const mockCreateOrUpdatePullRequest = jest.fn();

const mockGenerateMergeRequestSafe = jest.fn();
const mockGetDefaultPromptOptions = jest.fn(() => ({ includeGitDiff: true }));
const mockGenerateMergeRequest = jest.fn();
jest.mock("../merge-request-generator.mjs", () => ({
    generateMergeRequestSafe: (...a) => mockGenerateMergeRequestSafe(...a),
    getDefaultPromptOptions: (...a) => mockGetDefaultPromptOptions(...a),
    generateMergeRequest: (...a) => mockGenerateMergeRequest(...a),
}));

const mockFormatSourceBranchDisplay = jest.fn((b) => b);
jest.mock("../utils/branch-format.mjs", () => ({
    formatSourceBranchDisplay: (...a) => mockFormatSourceBranchDisplay(...a),
}));

const baseValidation = {
    sourceBranch: "feature-x",
    targetBranch: "main",
    jiraTickets: "PROJ-1",
    remoteSourceBranch: null,
    remoteTargetBranch: null,
    upstreamRemoteName: null,
};

const makeResult = (over = {}) => ({
    title: "Init Title",
    description: "Init Description",
    aiModel: "ChatGPT",
    model: "gpt-4",
    promptOptions: { a: 1 },
    ...over,
});

beforeEach(() => {
    jest.clearAllMocks();
    setMockAnswers([]);
    mockValidatePRInputAndBranches.mockResolvedValue({ ...baseValidation });
    mockGetDefaultPromptOptions.mockReturnValue({ includeGitDiff: true });
    jest.spyOn(console, "log").mockImplementation(() => {
        return;
    });
    jest.spyOn(console, "error").mockImplementation(() => {
        return;
    });
});

describe("executePRWorkflow", () => {
    const buildRepoProvider = () => ({
        findExistingPullRequest: (...a) => mockFindExistingPullRequest(...a),
        createOrUpdatePullRequest: (...a) => mockCreateOrUpdatePullRequest(...a),
    });
    test("new PR save", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 1 });
        setMockAnswers(["1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: {
                findExistingPullRequest: (...a) => mockFindExistingPullRequest(...a),
                createOrUpdatePullRequest: (...a) => mockCreateOrUpdatePullRequest(...a),
            },
        });
        expect(mockCreateOrUpdatePullRequest).toHaveBeenCalled();
    });

    test("existing PR cancel returns cancellation object", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 5, title: "Old", body: "B" });
        setMockAnswers(["3"]);
        const result = await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: {
                findExistingPullRequest: (...a) => mockFindExistingPullRequest(...a),
                createOrUpdatePullRequest: (...a) => mockCreateOrUpdatePullRequest(...a),
            },
        });
        expect(result).toEqual(expect.objectContaining({ cancelled: true }));
    });

    test("existing PR fresh regen then save", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 9, title: "T", body: "B" });
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult({ title: "Fresh" }));
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 9 });
        setMockAnswers(["1", "1"]);
        await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockGenerateMergeRequestSafe).toHaveBeenCalled();
        expect(mockCreateOrUpdatePullRequest).toHaveBeenCalledWith(
            expect.objectContaining({ title: "Fresh" })
        );
    });

    test("existing PR regenerate with instructions then cancel", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 4, title: "Old", body: "B" });
        mockOpenInEditor.mockResolvedValue("Security focus");
        mockGenerateMergeRequest.mockResolvedValue(makeResult({ title: "Regenerated" }));
        setMockAnswers(["2", "4"]);
        await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        }).catch(() => {
            return;
        });
        expect(mockGenerateMergeRequest).toHaveBeenCalled();
        const opts = mockGenerateMergeRequest.mock.calls[0][4];
        expect(opts.promptOptions.additionalInstructions).toBe("Security focus");
        expect(mockCreateOrUpdatePullRequest).not.toHaveBeenCalled();
    });

    test("edit via editor then save", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue("vim");
        mockEditPullRequestContent.mockResolvedValue({ title: "Edited", description: "Desc" });
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 2 });
        setMockAnswers(["2", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Edited");
    });

    test("rollback restores original", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue("vim");
        mockEditPullRequestContent.mockResolvedValue({ title: "Temp", description: "Temp" });
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 3 });
        setMockAnswers(["2", "4", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Init Title");
    });

    test("manual edit fallback when no editor", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue(null);
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 4 });
        setMockAnswers(["2", "Manual Title", "Manual Desc", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Manual Title");
    });

    test("regeneration failure handled", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockOpenInEditor.mockResolvedValue("Some notes");
        mockGenerateMergeRequest.mockRejectedValue(new Error("boom"));
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 5 });
        setMockAnswers(["3", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Init Title");
    });

    test("successful regeneration updates title and saves (covers lines 194-201)", async () => {
        // New PR path (no existing PR), choose option 3 to regenerate, then 1 to save
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockOpenInEditor.mockResolvedValue("Performance focus\n# comment line\n");
        mockGenerateMergeRequest.mockResolvedValue(
            makeResult({ title: "Regenerated Title", description: "New Desc" })
        );
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 51 });
        setMockAnswers(["3", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        // Ensure regenerateMergeRequest was invoked and final save uses regenerated title
        expect(mockGenerateMergeRequest).toHaveBeenCalled();
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Regenerated Title");
    });

    test("validation error propagates", async () => {
        mockValidatePRInputAndBranches.mockRejectedValue(new Error("bad"));
        await expect(
            executePRWorkflow({
                args: [],
                remoteName: "origin",
                config: { githubToken: "TOK" },
                repository: "owner/repo",
                repoProvider: buildRepoProvider(),
            })
        ).rejects.toThrow("bad");
    });

    test("existing PR invalid menu choice then cancel", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 12, title: "Old", body: "Body" });
        setMockAnswers(["9", "3"]); // invalid then cancel
        const res = await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(res).toEqual(expect.objectContaining({ cancelled: true }));
    });

    test("option 5 invalid when no changes then save", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 13 });
        setMockAnswers(["5", "1"]); // invalid option then save
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockCreateOrUpdatePullRequest).toHaveBeenCalled();
    });

    test("cancel without changes via option 4 after generation", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        setMockAnswers(["4"]); // cancel immediately
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockCreateOrUpdatePullRequest).not.toHaveBeenCalled();
    });

    test("invalid option then save", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 6 });
        setMockAnswers(["9", "1"]); // invalid then save
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockCreateOrUpdatePullRequest).toHaveBeenCalled();
    });

    test("cancel with changes via option 5", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue("vim");
        mockEditPullRequestContent.mockResolvedValue({ title: "Change", description: "Desc" });
        setMockAnswers(["2", "5"]); // edit then cancel
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockCreateOrUpdatePullRequest).not.toHaveBeenCalled();
    });

    test("editor error falls back to manual input", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue("vim");
        mockEditPullRequestContent.mockRejectedValue(new Error("editor fail"));
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 7 });
        // sequence: choose edit (2) -> manual title -> manual desc -> save (1)
        setMockAnswers(["2", "Manual After Error", "Desc After Error", "1"]);
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Manual After Error");
    });

    test("regenerate openInEditor error handled gracefully", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockOpenInEditor.mockRejectedValue(new Error("open fail"));
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 8 });
        setMockAnswers(["3", "1"]); // attempt regenerate then save
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        const call = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(call.title).toBe("Init Title"); // unchanged
    });

    test("regenerate with multi-line instructions filters comments", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 11, title: "Old", body: "B" });
        mockOpenInEditor.mockResolvedValue(`# comment\n# another\nReal instruction line\n`);
        mockGenerateMergeRequest.mockResolvedValue(
            makeResult({ title: "With Comments", description: "Desc plus" })
        );
        setMockAnswers(["2", "4"]); // existing PR option 2 (regenerate with instructions), then cancel
        await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        }).catch(() => {
            return;
        });
        const opts = mockGenerateMergeRequest.mock.calls[0][4];
        expect(opts.promptOptions.additionalInstructions).toBe("Real instruction line");
    });

    test("existing PR regenerate failure triggers fallback logs (covers lines 384-385)", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 21, title: "OldT", body: "OB" });
        mockOpenInEditor.mockResolvedValue("Some instruction");
        mockGenerateMergeRequest.mockRejectedValue(new Error("regen fail"));
        setMockAnswers(["2"]); // choose regenerate with instructions
        await expect(
            executePRWorkflow({
                args: [],
                remoteName: "origin",
                config: { githubToken: "TOK" },
                repository: "owner/repo",
                repoProvider: buildRepoProvider(),
            })
        ).rejects.toThrow(); // downstream failure due to missing fallback result
        // Ensure the specific log lines (384-385) executed
        const errorCalls = console.error.mock.calls.flat().join(" ");
        expect(errorCalls).toContain("Failed to regenerate with instructions");
        const logCalls = console.log.mock.calls.flat().join(" ");
        expect(logCalls).toContain("Falling back to fresh generation");
    });

    test("existing PR regenerate with empty body passes empty previousResult description", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 22, title: "Old", body: "" });
        mockOpenInEditor.mockResolvedValue("Improve docs");
        mockGenerateMergeRequest.mockResolvedValue(
            makeResult({ title: "Regenerated Empty Body", description: "New Desc" })
        );
        setMockAnswers(["2", "4"]); // choose regenerate w/ instructions then cancel in menu
        await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        }).catch(() => {
            return;
        });
        const opts = mockGenerateMergeRequest.mock.calls[0][4];
        expect(opts.promptOptions.previousResult.description).toBe("");
        expect(opts.promptOptions.additionalInstructions).toBe("Improve docs");
    });

    test("existing PR regenerate uses fallback getDefaultPromptOptions when initial promptOptions is empty", async () => {
        mockFindExistingPullRequest.mockResolvedValue({ number: 23, title: "Old", body: "Body" });
        // First call (workflow-level) returns null so variable promptOptions is falsy; second call (inside case 2 expression) returns fallback object
        mockGetDefaultPromptOptions.mockReset();
        mockGetDefaultPromptOptions
            .mockReturnValueOnce(null)
            .mockReturnValueOnce({ fallback: true });
        mockOpenInEditor.mockResolvedValue("Add perf notes");
        mockGenerateMergeRequest.mockResolvedValue(
            makeResult({ title: "Using Fallback", description: "Desc" })
        );
        setMockAnswers(["2", "4"]); // regenerate then cancel out of menu
        await executePRWorkflow({
            args: [],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        }).catch(() => {
            return;
        });
        const opts = mockGenerateMergeRequest.mock.calls[0][4];
        expect(opts.promptOptions.fallback).toBe(true); // came from second call
        expect(opts.promptOptions.additionalInstructions).toBe("Add perf notes");
    });

    test("invalid option when hasChanges true shows 1-5 range and no save", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        mockGenerateMergeRequestSafe.mockResolvedValue(makeResult());
        mockGetEditorCommand.mockResolvedValue("vim");
        mockEditPullRequestContent.mockResolvedValue({ title: "Changed", description: "Changed" });
        setMockAnswers(["2", "9", "5"]); // edit to set hasChanges, then invalid option, then cancel with changes
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        // ensure no save happened
        expect(mockCreateOrUpdatePullRequest).not.toHaveBeenCalled();
        // check log contained the 1-5 range prompt due to invalid option with hasChanges true
        const logText = console.log.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(logText).toMatch(/Please choose 1-5/);
    });

    test("regeneration with empty initial promptOptions adds instructions correctly", async () => {
        mockFindExistingPullRequest.mockResolvedValue(null);
        // initial result has empty promptOptions {}
        mockGenerateMergeRequestSafe.mockResolvedValue(
            makeResult({ promptOptions: {}, title: "Base Title", description: "Base Desc" })
        );
        mockOpenInEditor.mockResolvedValue(`# comment\nReal line\n`);
        mockGenerateMergeRequest.mockResolvedValue(
            makeResult({ title: "Regen Title", description: "Regen Desc" })
        );
        mockCreateOrUpdatePullRequest.mockResolvedValue({ number: 99 });
        setMockAnswers(["3", "1"]); // regenerate then save
        await executePRWorkflow({
            args: ["feature-x", "main"],
            remoteName: "origin",
            config: { githubToken: "TOK" },
            repository: "owner/repo",
            repoProvider: buildRepoProvider(),
        });
        expect(mockGenerateMergeRequest).toHaveBeenCalled();
        const opts = mockGenerateMergeRequest.mock.calls.at(-1)[4];
        expect(opts.promptOptions.additionalInstructions).toBe("Real line");
        expect(opts.promptOptions.previousResult.title).toBe("Base Title");
        // ensure save used regenerated title
        const saveCall = mockCreateOrUpdatePullRequest.mock.calls.at(-1)[0];
        expect(saveCall.title).toBe("Regen Title");
    });
});
