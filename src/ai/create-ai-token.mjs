// Shared helper logic for --create-ai-token in gen-mr / gen-pr
// Currently only ChatGPT (OpenAI) provider is supported.
// Exports: createAiToken({ llmRaw, isGlobal, toolName })

import { configureChatGPTToken } from "./chatgpt.mjs";

// Aliases mapping to ChatGPT provider
const CHATGPT_ALIASES = new Set(["chatgpt", "openai", "gpt", "gpt-3.5", "gpt-4", "gpt-4o"]);

/**
 * Core logic for creating AI token (ChatGPT only for now)
 * @param {object} params
 * @param {string} params.llmRaw Raw LLM argument from CLI (e.g. 'ChatGPT')
 * @param {boolean} params.isGlobal Whether to store globally
 * @param {string} params.toolName Name of CLI tool for messages
 */
export async function createAiToken({ llmRaw, isGlobal, toolName }) {
    const llm = String(llmRaw || "")
        .trim()
        .toLowerCase();

    if (!llm) {
        throw new Error(`Missing LLM argument. Example: ${toolName} --create-ai-token ChatGPT`);
    }

    try {
        if (CHATGPT_ALIASES.has(llm)) {
            await configureChatGPTToken(isGlobal);
        } else {
            console.log(`ℹ️  Try: ${toolName} --create-ai-token ChatGPT`);
            throw new Error(
                `Unsupported LLM '${llmRaw}'. Only ChatGPT is implemented at the moment.`
            );
        }
    } catch (error) {
        throw new Error(`AI token configuration failed: ${error.message}`);
    }
}
