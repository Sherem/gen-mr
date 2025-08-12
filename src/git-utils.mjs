// git-utils.mjs
// Handles git operations and prompt generation for merge requests

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Get current git branch name
 * @returns {Promise<string>} Current branch name
 */
export const getCurrentBranch = async () => {
    try {
        const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD");
        return stdout.trim();
    } catch (error) {
        throw new Error(`Failed to get current branch: ${error.message}`);
    }
};

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
 * Get changed files separated by type (added, modified, deleted)
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @returns {Promise<{added:string[], modified:string[], deleted:string[]}>}
 */
export const getChangedFilesByType = async (sourceBranch, targetBranch) => {
    try {
        const [addedRes, modifiedRes, deletedRes] = await Promise.all([
            execAsync(`git diff --name-only --diff-filter=A ${targetBranch}...${sourceBranch}`),
            execAsync(`git diff --name-only --diff-filter=M ${targetBranch}...${sourceBranch}`),
            execAsync(`git diff --name-only --diff-filter=D ${targetBranch}...${sourceBranch}`),
        ]);

        const parse = (stdout) =>
            stdout
                .trim()
                .split("\n")
                .filter((l) => l.length > 0);

        return {
            added: parse(addedRes.stdout),
            modified: parse(modifiedRes.stdout),
            deleted: parse(deletedRes.stdout),
        };
    } catch (error) {
        throw new Error(`Failed to get changed files by type: ${error.message}`);
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
 * Get a named remote URL
 * @param {string} remoteName - Remote name (e.g., origin, upstream)
 * @returns {Promise<string>} Remote URL
 */
export const getRemoteUrl = async (remoteName) => {
    try {
        const { stdout } = await execAsync(`git config --get remote.${remoteName}.url`);
        return stdout.trim();
    } catch (error) {
        throw new Error(`Failed to get remote '${remoteName}' url: ${error.message}`);
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
 * Get repository information from a named git remote
 * @param {string} remoteName
 * @returns {Promise<object>} Repository type and details
 */
export const getRepositoryFromRemote = async (remoteName) => {
    try {
        const remoteUrl = await getRemoteUrl(remoteName);
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

/**
 * Get the upstream tracking ref for a local branch (e.g., origin/feature-x)
 * @param {string} localBranch
 * @returns {Promise<string|null>} upstream ref or null if none is configured
 */
export const getUpstreamRef = async (localBranch) => {
    try {
        const { stdout } = await execAsync(`git rev-parse --abbrev-ref ${localBranch}@{u}`);
        return stdout.trim();
    } catch {
        return null;
    }
};

/**
 * Fetch from a specific remote
 * @param {string} remote
 * @returns {Promise<void>}
 */
export const fetchRemote = async (remote) => {
    try {
        await execAsync(`git fetch ${remote} --quiet`);
    } catch (error) {
        throw new Error(`Failed to fetch remote: ${error.message}`);
    }
};

/**
 * Compute ahead/behind counts between upstream and local branch
 * @param {string} upstreamRef - like origin/feature-x
 * @param {string} localBranch - local branch name
 * @returns {Promise<{behind:number,ahead:number}>}
 */
export const getAheadBehind = async (upstreamRef, localBranch) => {
    try {
        const { stdout } = await execAsync(
            `git rev-list --left-right --count ${upstreamRef}...${localBranch}`
        );
        const [behindStr, aheadStr] = stdout.trim().split(/\s+/);
        const behind = parseInt(behindStr || "0", 10);
        const ahead = parseInt(aheadStr || "0", 10);
        return { behind, ahead };
    } catch (error) {
        throw new Error(`Failed to compare with upstream: ${error.message}`);
    }
};

/**
 * Get the commit SHA for a given ref/branch
 * @param {string} ref - branch name or any git ref (e.g., HEAD, feature-x)
 * @returns {Promise<string>} Full commit SHA
 */
export const getCommitSha = async (ref) => {
    try {
        const { stdout } = await execAsync(`git rev-parse ${ref}`);
        return stdout.trim();
    } catch (error) {
        throw new Error(`Failed to get commit SHA for '${ref}': ${error.message}`);
    }
};
