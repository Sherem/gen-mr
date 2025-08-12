// validation.mjs
// Configuration and repository validation functionality

import { getConfig } from "./common.mjs";
import {
    getRepositoryFromRemote,
    getUpstreamRef,
    fetchRemote,
    getAheadBehind,
    getCommitSha,
    getCurrentBranch,
} from "../git-provider/git-provider.mjs";

/**
 * Parse and validate positional CLI arguments according to documented help.
 * Supported forms:
 *  - gen-pr <sourceBranch> <targetBranch> [jiraTickets]
 *  - gen-pr <targetBranch> [jiraTickets]   (uses current branch as source)
 *
 * Failure prints usage and exits (mirrors existing CLI behavior).
 *
 * @param {object} params
 * @param {string[]} params.positionalArgs Raw positional args (argv._)
 * @param {Function} params.showUsage Function to print usage
 * @returns {Promise<{ sourceBranch: string, targetBranch: string, jiraTickets: string | undefined }>}
 */
export const validateArguments = async ({ positionalArgs, showUsage }) => {
    const count = positionalArgs.length;

    if (count === 0) {
        console.log("❌ Error: Missing required arguments");
        console.log(
            "💡 Provide: <sourceBranch> <targetBranch> or just <targetBranch> to use current branch as source"
        );
        showUsage();
        process.exit(1);
    }

    let sourceBranch;
    let targetBranch;
    let jiraTickets;

    if (count === 1) {
        // Only target provided; use current branch as source
        targetBranch = positionalArgs[0];
        try {
            sourceBranch = await getCurrentBranch();
        } catch (error) {
            console.log(
                `❌ Error: Unable to determine current branch automatically: ${error.message}`
            );
            process.exit(1);
        }
        if (!sourceBranch) {
            console.log(
                "❌ Error: Could not resolve current branch. Pass both <sourceBranch> <targetBranch> explicitly."
            );
            process.exit(1);
        }
    } else {
        // 2 or more args -> first two are source/target
        sourceBranch = positionalArgs[0];
        targetBranch = positionalArgs[1];
        jiraTickets = positionalArgs[2];
    }

    if (!sourceBranch || !targetBranch) {
        console.log("❌ Error: Missing required arguments <sourceBranch> <targetBranch>");
        showUsage();
        process.exit(1);
    }

    return { sourceBranch, targetBranch, jiraTickets };
};

/**
 * Validate configuration and repository setup for PR generation
 * @returns {Promise<object>} Configuration and repository information
 * @throws {Error} If configuration or repository validation fails
 */
export const validateGitHubConfigAndRepository = async (remoteName) => {
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
        repoInfo = await getRepositoryFromRemote(remoteName);
    } catch (error) {
        throw new Error(
            `Failed to detect repository from git remote: ${error.message}. Make sure you're in a git repository with a '${remoteName}' remote configured.`
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
 * Validate that a local branch is in sync with its tracked remote branch
 * and return the remote-tracked branch name to use for GitHub operations.
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
 * @param {string} localBranch
 * @param {string} defaultRemoteName
 * @returns {Promise<{ githubRemoteBranch: string, upstreamRef: string, upstreamRemote: string, commitSha: string }>}
 * @throws {Error} if branch has no upstream, has unpushed commits, or is out of sync
 */
export const validateBranchSyncAndGetRemote = async (localBranch, defaultRemoteName) => {
    if (!localBranch) {
        throw new Error("Local branch name is required");
    }

    // Determine upstream tracking ref (e.g., origin/feature-xyz or origin/different-name)
    const upstreamRef = await getUpstreamRef(localBranch);
    if (!upstreamRef) {
        throw new Error(
            `Branch '${localBranch}' has no upstream tracking branch. Push it first with: git push -u ${defaultRemoteName} ${localBranch}`
        );
    }
    const upstreamRemote = upstreamRef.split("/")[0];
    const upstreamBranchName = upstreamRef.slice(upstreamRemote.length + 1); // remove 'remote/' prefix

    // Ensure we compare against latest remote state
    await fetchRemote(upstreamRemote);

    // Compare commit counts between upstream and local
    const { behind, ahead } = await getAheadBehind(upstreamRef, localBranch);
    if (ahead > 0 && behind > 0) {
        throw new Error(
            `Local branch '${localBranch}' and remote '${upstreamRef}' have diverged (local ahead by ${ahead}, behind by ${behind}). Sync your branch (e.g., git pull --rebase && git push).`
        );
    }
    if (ahead > 0) {
        throw new Error(
            `Local branch '${localBranch}' is ahead of '${upstreamRef}' by ${ahead} commit(s). Push your commits first (git push).`
        );
    }
    if (behind > 0) {
        throw new Error(
            `Local branch '${localBranch}' is behind '${upstreamRef}' by ${behind} commit(s). Update your branch first (e.g., git pull --rebase).`
        );
    }

    // Use the tracked branch name on GitHub operations
    const githubRemoteBranch = upstreamBranchName;

    // Resolve the current commit SHA for the provided local branch
    const commitSha = await getCommitSha(localBranch);

    return { githubRemoteBranch, upstreamRef, upstreamRemote, commitSha };
};

/**
 * End-to-end validation for PR creation combining:
 *  - Positional arguments parsing (source/target/jiraTickets)
 *  - Optional single-arg mode using current branch as source
 *  - Remote name resolution
 *  - Config & repository validation
 *  - Branch sync validation (source & target)
 *  - Prevent same-commit PRs
 *
 * On validation failure this function prints a helpful message and exits (to preserve current CLI behavior).
 *
 * @param {object} params
 * @param {any} params.options Parsed minimist result (options)
 * @param {object} params.args Named args { sourceBranch, targetBranch, jiraTickets }
 * @param {Function} params.showUsage Function to print usage help
 * @returns {Promise<{
 *   sourceBranch: string,
 *   targetBranch: string,
 *   jiraTickets: string,
 *   remoteName: string,
 *   config: object,
 *   remoteSourceBranch: string,
 *   remoteTargetBranch: string,
 *   upstreamRemoteName: string | undefined,
 * }>} Aggregated validated data
 */
export const validatePRInputAndBranches = async ({ args /* already validated */, remoteName }) => {
    // Arguments are assumed validated & present (sourceBranch, targetBranch[, jiraTickets])
    const { sourceBranch, targetBranch, jiraTickets } = args;

    // Ensure local branches are fully synced to their upstream and get the remote-tracked names
    let remoteSourceBranch;
    let sourceSha;
    let remoteTargetBranch;
    let targetSha;
    let upstreamRemoteName;
    try {
        ({
            githubRemoteBranch: remoteSourceBranch,
            upstreamRemote: upstreamRemoteName,
            commitSha: sourceSha,
        } = await validateBranchSyncAndGetRemote(sourceBranch, remoteName));
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        process.exit(1);
    }

    try {
        ({ githubRemoteBranch: remoteTargetBranch, commitSha: targetSha } =
            await validateBranchSyncAndGetRemote(targetBranch, remoteName));
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        process.exit(1);
    }

    if (sourceSha === targetSha) {
        console.log(`❌ Error: Source and target branches at the same commit`);
        process.exit(1);
    }

    return {
        sourceBranch,
        targetBranch,
        jiraTickets,
        remoteName,
        remoteSourceBranch,
        remoteTargetBranch,
        upstreamRemoteName,
    };
};
