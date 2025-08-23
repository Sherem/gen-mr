// common-cli-flags.mjs
// Shared handler for CLI flags: --create-ai-token, --use-model, --show-config
// Allows callers (gen-pr / gen-mr) to supply an ordered subset of flags to
// preserve original precedence relative to other tool-specific flags.

import { createAiToken } from "../ai/create-ai-token.mjs";
import { setChatGPTModel, CHATGPT_MODELS } from "../ai/chatgpt.mjs";
import { showCurrentConfig } from "../config/common.mjs";
import { configureEditor } from "../config/editor-config.mjs";
import { configureGithubToken, configureGitlabToken } from "../config/token-config.mjs";

/**
 * Handle shared CLI flags. Processes the first matching flag (if any)
 * from the provided include list and returns true when handled.
 *
 * @param {object} params
 * @param {object} params.argv Parsed minimist argv object
 * @param {string} params.toolName Name of invoking CLI tool (e.g. 'gen-pr')
 * @param {string[]} [params.include] Ordered subset of flags to consider.
 *                                   Defaults to all shared flags.
 * @returns {Promise<boolean>} true if a flag was handled and caller should exit early
 */
export async function handleCommonCliFlags({ argv, toolName, include }) {
    const flagsOrder =
        include && include.length > 0
            ? include
            : ["create-token", "create-ai-token", "configure-editor", "use-model", "show-config"];

    const isGlobal = argv.global || argv.g;

    for (const flag of flagsOrder) {
        if (flag === "create-token" && argv["create-token"]) {
            try {
                if (toolName === "gen-mr") {
                    await configureGitlabToken(isGlobal);
                } else {
                    await configureGithubToken(isGlobal);
                }
            } catch (error) {
                throw new Error(`Token configuration failed: ${error.message}`);
            }
            return true;
        }

        if (flag === "create-ai-token" && argv["create-ai-token"]) {
            const llmRaw = argv["create-ai-token"]; // e.g. ChatGPT
            await createAiToken({ llmRaw, isGlobal, toolName });
            return true;
        }

        if (flag === "configure-editor" && argv["configure-editor"]) {
            try {
                await configureEditor(isGlobal);
            } catch (error) {
                throw new Error(`Editor configuration failed: ${error.message}`);
            }
            return true;
        }

        if (flag === "use-model" && argv["use-model"]) {
            const modelRaw = argv["use-model"]; // e.g. gpt-4o
            try {
                await setChatGPTModel(String(modelRaw), isGlobal);
            } catch (error) {
                // Mirror previous behaviour: print supported models then throw
                console.log("ℹ️  Supported models:", CHATGPT_MODELS.join(", "));
                throw new Error(`Failed to set model: ${error.message}`);
            }
            return true;
        }

        if (flag === "show-config" && argv["show-config"]) {
            try {
                await showCurrentConfig(isGlobal, toolName);
            } catch (error) {
                throw new Error(`Failed to show configuration: ${error.message}`);
            }
            return true;
        }
    }

    return false;
}
