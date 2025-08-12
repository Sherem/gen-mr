// merge-request-generator.mjs
// Main functionality to generate merge request names and descriptions using specified AI models

import { generateMergeRequestWithChatGPT } from "./ai/chatgpt.mjs";
import { generateMergeRequestPrompt } from "./prompt-generator.mjs";
import { validateGitContext } from "./git-provider/git-provider.mjs";
import { formatSourceBranchDisplay } from "./utils/branch-format.mjs";

/**
 * Generate merge request title and description using the specified AI model
 * @param {object} config - Configuration object containing tokens and settings
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs
 * @param {object} options - Additional options for generation
 * @returns {Promise<object>} Generated title and description
 */
export const generateMergeRequest = async (
    config,
    sourceBranch,
    targetBranch,
    jiraTickets = "",
    options = {}
) => {
    const { aiModel = "ChatGPT", promptOptions = {} } = options;

    // Validate git context first
    try {
        await validateGitContext(sourceBranch, targetBranch);
    } catch (error) {
        throw new Error(`Git validation failed: ${error.message}`);
    }

    // Generate comprehensive prompt with git context
    const prompt = await generateMergeRequestPrompt(
        sourceBranch,
        targetBranch,
        jiraTickets,
        promptOptions
    );

    // Generate content using the specified AI model
    let aiResponse;
    const model = config.openaiModel || "gpt-3.5-turbo";
    const normalizedModel = aiModel.toLowerCase();

    if (
        normalizedModel === "chatgpt" ||
        normalizedModel === "openai" ||
        normalizedModel === "gpt"
    ) {
        if (!config.openaiToken) {
            throw new Error("OpenAI token is required for ChatGPT model");
        }
        aiResponse = await generateMergeRequestWithChatGPT(config.openaiToken, prompt, model);
    } else {
        throw new Error(`Unsupported AI model '${aiModel}'. Currently only ChatGPT is supported.`);
    }

    // Parse the AI response to extract title and description
    const lines = aiResponse.split("\n");
    const title = lines[0].trim();
    const description = lines.slice(1).join("\n").trim();

    return {
        title,
        description,
        aiModel,
        model,
        prompt: promptOptions.includePrompt ? prompt : undefined,
    };
};

/**
 * Generate merge request with enhanced error handling and logging
 * @param {object} config - Configuration object
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - JIRA ticket IDs
 * @param {object} options - Generation options
 * @returns {Promise<object>} Generated merge request data
 */
export const generateMergeRequestSafe = async (
    config,
    sourceBranch,
    targetBranch,
    jiraTickets = "",
    options = {}
) => {
    const { verbose = false, remoteName, remoteSourceBranch, remoteTargetBranch } = options;

    try {
        if (verbose) {
            // Prefer a preformatted display name when provided (includes remote tracking info)
            const displaySource = formatSourceBranchDisplay(
                sourceBranch,
                remoteName,
                remoteSourceBranch
            );
            const displayTarget = formatSourceBranchDisplay(
                targetBranch,
                remoteName,
                remoteTargetBranch || targetBranch
            );
            console.log(`🔍 Generating merge request for ${displaySource} → ${displayTarget}`);
            if (jiraTickets) {
                console.log(`🎫 Including JIRA tickets: ${jiraTickets}`);
            }
        }

        const result = await generateMergeRequest(
            config,
            sourceBranch,
            targetBranch,
            jiraTickets,
            options
        );

        if (verbose) {
            console.log(`✅ Generated merge request using ${result.aiModel} (${result.model})`);
        }

        return result;
    } catch (error) {
        if (verbose) {
            console.error(`❌ Failed to generate merge request: ${error.message}`);
        }
        throw error;
    }
};

/**
 * Get default prompt options based on user preferences or sensible defaults
 * @param {object} userOptions - User-specified options
 * @returns {object} Merged prompt options
 */
export const getDefaultPromptOptions = (userOptions = {}) => {
    return {
        includeGitDiff: true,
        includeCommitMessages: true,
        includeChangedFiles: true,
        maxDiffLines: 100,
        includePrompt: false,
        ...userOptions,
    };
};

/**
 * Validate merge request generation parameters
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {object} config - Configuration object
 * @returns {void} Throws error if validation fails
 */
export const validateMergeRequestParams = (sourceBranch, targetBranch, config) => {
    if (!sourceBranch || typeof sourceBranch !== "string") {
        throw new Error("Source branch is required and must be a string");
    }

    if (!targetBranch || typeof targetBranch !== "string") {
        throw new Error("Target branch is required and must be a string");
    }

    if (!config || typeof config !== "object") {
        throw new Error("Configuration object is required");
    }

    if (!config.openaiToken) {
        throw new Error("OpenAI token is required in configuration");
    }
};
