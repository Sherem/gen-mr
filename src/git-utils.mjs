// git-utils.mjs
// Handles git operations and prompt generation for merge requests

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Get git diff between two branches
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<string>} Git diff output
 */
export const getGitDiff = async (sourceBranch, targetBranch) => {
    try {
        const { stdout } = await execAsync(`git diff ${targetBranch}...${sourceBranch}`);
        return stdout.trim();
    } catch (error) {
        throw new Error(`Failed to get git diff: ${error.message}`);
    }
};

/**
 * Get commit messages between two branches
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<string[]>} Array of commit messages
 */
export const getCommitMessages = async (sourceBranch, targetBranch) => {
    try {
        const { stdout } = await execAsync(
            `git log ${targetBranch}..${sourceBranch} --pretty=format:"%s"`
        );
        return stdout
            .trim()
            .split("\n")
            .filter((line) => line.length > 0);
    } catch (error) {
        throw new Error(`Failed to get commit messages: ${error.message}`);
    }
};

/**
 * Get changed files between two branches
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<string[]>} Array of changed file paths
 */
export const getChangedFiles = async (sourceBranch, targetBranch) => {
    try {
        const { stdout } = await execAsync(
            `git diff --name-only ${targetBranch}...${sourceBranch}`
        );
        return stdout
            .trim()
            .split("\n")
            .filter((line) => line.length > 0);
    } catch (error) {
        throw new Error(`Failed to get changed files: ${error.message}`);
    }
};

/**
 * Get current git repository information
 * @returns {Promise<object>} Repository info with remote URL and name
 */
export const getRepoInfo = async () => {
    try {
        const { stdout: remoteUrl } = await execAsync("git config --get remote.origin.url");
        const { stdout: repoName } = await execAsync("git rev-parse --show-toplevel");

        return {
            remoteUrl: remoteUrl.trim(),
            repoName: repoName.trim().split("/").pop(),
        };
    } catch (error) {
        throw new Error(`Failed to get repository info: ${error.message}`);
    }
};

/**
 * Get the origin remote URL
 * @returns {Promise<string>} Origin remote URL
 */
export const getOriginRemote = async () => {
    try {
        const { stdout } = await execAsync("git config --get remote.origin.url");
        return stdout.trim();
    } catch (error) {
        throw new Error(`Failed to get origin remote: ${error.message}`);
    }
};

/**
 * Parse repository information from git remote URL
 * @param {string} remoteUrl - Git remote URL
 * @returns {object} Parsed repository information
 */
export const parseRepoFromRemote = (remoteUrl) => {
    // Remove .git suffix if present
    const cleanUrl = remoteUrl.replace(/\.git$/, "");

    // Handle SSH URLs (git@hostname:owner/repo)
    const sshMatch = cleanUrl.match(/^git@([^:]+):(.+)/);
    if (sshMatch) {
        const hostname = sshMatch[1];
        const repoPath = sshMatch[2];
        return {
            hostname,
            fullName: repoPath,
            owner: repoPath.split("/")[0],
            name: repoPath.split("/")[1],
        };
    }

    // Handle HTTPS URLs (https://hostname/owner/repo)
    const httpsMatch = cleanUrl.match(/^https?:\/\/([^/]+)\/(.+)/);
    if (httpsMatch) {
        const hostname = httpsMatch[1];
        const repoPath = httpsMatch[2];
        return {
            hostname,
            fullName: repoPath,
            owner: repoPath.split("/")[0],
            name: repoPath.split("/")[1],
        };
    }

    throw new Error(`Unable to parse repository URL: ${remoteUrl}`);
};

/**
 * Detect repository type from hostname
 * @param {string} hostname - Repository hostname
 * @returns {string} Repository type ('github', 'gitlab', 'unknown')
 */
export const detectRepoType = (hostname) => {
    const lowerHostname = hostname.toLowerCase();

    if (lowerHostname === "github.com") {
        return "github";
    }

    if (lowerHostname.includes("gitlab")) {
        return "gitlab";
    }

    return "unknown";
};

/**
 * Get repository information from git origin remote
 * @returns {Promise<object>} Repository type and details
 */
export const getRepositoryFromRemote = async () => {
    try {
        const remoteUrl = await getOriginRemote();
        const repoInfo = parseRepoFromRemote(remoteUrl);
        const repoType = detectRepoType(repoInfo.hostname);

        return {
            type: repoType,
            hostname: repoInfo.hostname,
            fullName: repoInfo.fullName,
            owner: repoInfo.owner,
            name: repoInfo.name,
            remoteUrl,
        };
    } catch (error) {
        throw new Error(`Failed to detect repository from remote: ${error.message}`);
    }
};

/**
 * Validate that we're in a git repository and branches exist
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<boolean>} True if validation passes
 */
export const validateGitContext = async (sourceBranch, targetBranch) => {
    try {
        // Check if we're in a git repo
        await execAsync("git rev-parse --git-dir");

        // Check if branches exist
        await execAsync(`git rev-parse --verify ${sourceBranch}`);
        await execAsync(`git rev-parse --verify ${targetBranch}`);

        return true;
    } catch (error) {
        throw new Error(`Git validation failed: ${error.message}`);
    }
};

/**
 * Check if branches have any differences
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<boolean>} True if branches have differences
 */
export const branchesHaveDifferences = async (sourceBranch, targetBranch) => {
    try {
        const { stdout } = await execAsync(`git rev-list --count ${targetBranch}..${sourceBranch}`);
        const commitCount = parseInt(stdout.trim(), 10);
        return commitCount > 0;
    } catch (error) {
        throw new Error(`Failed to check branch differences: ${error.message}`);
    }
};
