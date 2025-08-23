import { describe, test, expect, jest, beforeEach } from "@jest/globals";

describe("handleCommonCliFlags", () => {
    let handleCommonCliFlags;
    let createAiTokenMock;
    let setChatGPTModelMock;
    let showCurrentConfigMock;

    beforeEach(async () => {
        jest.resetModules();

        // Mock the dependencies
        createAiTokenMock = jest.fn().mockResolvedValue(undefined);
        setChatGPTModelMock = jest.fn().mockResolvedValue(undefined);
        showCurrentConfigMock = jest.fn().mockResolvedValue(undefined);

        jest.doMock("../ai/create-ai-token.mjs", () => ({
            createAiToken: createAiTokenMock,
        }));

        jest.doMock("../ai/chatgpt.mjs", () => ({
            setChatGPTModel: setChatGPTModelMock,
            CHATGPT_MODELS: ["gpt-4o", "gpt-4o-mini"],
        }));

        jest.doMock("../config/common.mjs", () => ({
            showCurrentConfig: showCurrentConfigMock,
        }));

        jest.doMock("../config/editor-config.mjs", () => ({
            configureEditor: jest.fn().mockResolvedValue(undefined),
        }));

        jest.doMock("../config/token-config.mjs", () => ({
            configureGithubToken: jest.fn().mockResolvedValue(undefined),
        }));

        // Import the module under test after mocking
        const module = await import("../cli/common-cli-flags.mjs");
        handleCommonCliFlags = module.handleCommonCliFlags;
    });

    test("handles --create-ai-token", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "create-ai-token": "ChatGPT", g: true },
            toolName: "gen-pr",
            include: ["create-ai-token"],
        });
        expect(handled).toBe(true);
        expect(createAiTokenMock).toHaveBeenCalledWith({
            llmRaw: "ChatGPT",
            isGlobal: true,
            toolName: "gen-pr",
        });
    });

    test("handles --create-token", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "create-token": true, global: true },
            toolName: "gen-pr",
            include: ["create-token"],
        });
        expect(handled).toBe(true);
    });

    test("handles --configure-editor", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "configure-editor": true },
            toolName: "gen-pr",
            include: ["configure-editor"],
        });
        expect(handled).toBe(true);
    });

    test("handles --use-model", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "use-model": "gpt-4o" },
            toolName: "gen-pr",
            include: ["use-model"],
        });
        expect(handled).toBe(true);
        expect(setChatGPTModelMock).toHaveBeenCalledWith("gpt-4o", undefined);
    });

    test("handles --show-config", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "show-config": true, global: true },
            toolName: "gen-pr",
            include: ["show-config"],
        });
        expect(handled).toBe(true);
        expect(showCurrentConfigMock).toHaveBeenCalledWith(true, "gen-pr");
    });

    test("respects include order (first flag wins)", async () => {
        const handled = await handleCommonCliFlags({
            argv: { "use-model": "gpt-4o", "show-config": true },
            toolName: "gen-pr",
            include: ["show-config", "use-model"],
        });
        expect(handled).toBe(true);
        // show-config should run first and prevent model handling
        expect(showCurrentConfigMock).toHaveBeenCalledTimes(1);
        expect(setChatGPTModelMock).not.toHaveBeenCalled();
    });

    test("returns false when no flags present", async () => {
        const handled = await handleCommonCliFlags({
            argv: { _: [] },
            toolName: "gen-pr",
        });
        expect(handled).toBe(false);
    });
});
