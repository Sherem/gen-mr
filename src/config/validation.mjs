// validation.mjs
// Configuration and repository validation functionality

import { getConfig } from "./common.mjs";
import { getRepositoryFromRemote } from "../git-utils.mjs";

/**
 * Validate configuration and repository setup for PR generation
 * @returns {Promise<object>} Configuration and repository information
 * @throws {Error} If configuration or repository validation fails
 */
export const validateConfigAndRepository = async () => {
    // Get configuration
    let config;
    try {
        config = await getConfig();
    } catch {
        throw new Error(
            "No configuration found. Run 'gen-pr --create-token' to set up your GitHub token first."
        );
    }

    const { githubToken, openaiToken } = config;

    if (!githubToken) {
        throw new Error(
            "GitHub token not found in configuration. Run 'gen-pr --create-token' to set up your GitHub token."
        );
    }

    if (!openaiToken) {
        throw new Error(
            "OpenAI token not found in configuration. Please add 'openaiToken' to your .gen-mr/config.json file."
        );
    }

    // Detect repository type from git remote
    let repoInfo;
    try {
        repoInfo = await getRepositoryFromRemote();
    } catch (error) {
        throw new Error(
            `Failed to detect repository from git remote: ${error.message}. Make sure you're in a git repository with an origin remote configured.`
        );
    }

    // Check repository type and provide appropriate suggestions
    if (repoInfo.type === "gitlab") {
        throw new Error(
            `GitLab repository detected (${repoInfo.fullName} on ${repoInfo.hostname}). For GitLab repositories, consider using gen-mr instead of gen-pr.`
        );
    } else if (repoInfo.type === "unknown") {
        throw new Error(
            `Unknown repository type detected (host: ${repoInfo.hostname}). This tool currently supports GitHub repositories only. For GitLab repositories, use gen-mr instead.`
        );
    } else if (repoInfo.type !== "github") {
        throw new Error(
            `Unsupported repository type (host: ${repoInfo.hostname}). This tool supports GitHub repositories only.`
        );
    }

    const githubRepo = repoInfo.fullName;

    return {
        config,
        githubRepo,
        repoInfo,
    };
};
