// validation.mjs
// Configuration and repository validation functionality

import { getConfig } from "./common.mjs";
import {
    getRepositoryFromRemote,
    getUpstreamRef,
    fetchRemote,
    getAheadBehind,
} from "../git-utils.mjs";

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

/**
 * Validate that the local source branch is in sync with its tracked remote branch
 * and return the remote branch name to use for GitHub operations.
 *
 * Rules:
 * - If there's no upstream (tracked) branch configured, throw with guidance to push with -u
 * - Perform a fetch to ensure up-to-date comparison
 * - If local has commits not on remote (ahead > 0), throw
 * - If remote has commits not in local (behind > 0), throw (out of sync)
 * - Return the tracked remote branch name (without remote prefix) for GitHub usage
 *
 * Uses the provided local branch name for git operations, and returns the tracked
 * remote branch name for GitHub operations to handle differing names.
 *
 * @param {string} localSourceBranch
 * @returns {Promise<{ githubSourceBranch: string, upstreamRef: string, upstreamRemote: string }>}
 * @throws {Error} if branch has no upstream, has unpushed commits, or is out of sync
 */
export const validateBranchSyncAndGetRemote = async (localSourceBranch) => {
    if (!localSourceBranch) {
        throw new Error("Local source branch name is required");
    }

    // Determine upstream tracking ref (e.g., origin/feature-xyz or origin/different-name)
    const upstreamRef = await getUpstreamRef(localSourceBranch);
    if (!upstreamRef) {
        throw new Error(
            `Branch '${localSourceBranch}' has no upstream tracking branch. Push it first with: git push -u origin ${localSourceBranch}`
        );
    }
    const upstreamRemote = upstreamRef.split("/")[0];
    const upstreamBranchName = upstreamRef.slice(upstreamRemote.length + 1); // remove 'remote/' prefix

    // Ensure we compare against latest remote state
    await fetchRemote(upstreamRemote);

    // Compare commit counts between upstream and local
    const { behind, ahead } = await getAheadBehind(upstreamRef, localSourceBranch);
    if (ahead > 0 && behind > 0) {
        throw new Error(
            `Local branch '${localSourceBranch}' and remote '${upstreamRef}' have diverged (local ahead by ${ahead}, behind by ${behind}). Sync your branch (e.g., git pull --rebase && git push).`
        );
    }
    if (ahead > 0) {
        throw new Error(
            `Local branch '${localSourceBranch}' is ahead of '${upstreamRef}' by ${ahead} commit(s). Push your commits first (git push).`
        );
    }
    if (behind > 0) {
        throw new Error(
            `Local branch '${localSourceBranch}' is behind '${upstreamRef}' by ${behind} commit(s). Update your branch first (e.g., git pull --rebase).`
        );
    }

    // Use the tracked branch name on GitHub operations
    const githubSourceBranch = upstreamBranchName;

    return { githubSourceBranch, upstreamRef, upstreamRemote };
};
