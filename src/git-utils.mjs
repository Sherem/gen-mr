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
 * Generate a comprehensive prompt for AI to create merge request title and description
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs
 * @param {object} options - Additional options for prompt generation
 * @returns {Promise<string>} Generated prompt for AI
 */
export const generateMergeRequestPrompt = async (
    sourceBranch,
    targetBranch,
    jiraTickets = "",
    options = {}
) => {
    const {
        includeGitDiff = true,
        includeCommitMessages = true,
        includeChangedFiles = true,
        maxDiffLines = 1000,
    } = options;

    let prompt = `Generate a professional merge request title and description for merging '${sourceBranch}' into '${targetBranch}'.`;

    // Add JIRA tickets context
    if (jiraTickets && jiraTickets.trim()) {
        prompt += `\n\nRelated JIRA tickets: ${jiraTickets}`;
    }

    try {
        // Add commit messages context
        if (includeCommitMessages) {
            const commits = await getCommitMessages(sourceBranch, targetBranch);
            if (commits.length > 0) {
                prompt += `\n\nCommit messages:\n${commits.map((msg) => `- ${msg}`).join("\n")}`;
            }
        }

        // Add changed files context
        if (includeChangedFiles) {
            const files = await getChangedFiles(sourceBranch, targetBranch);
            if (files.length > 0) {
                prompt += `\n\nChanged files:\n${files.map((file) => `- ${file}`).join("\n")}`;
            }
        }

        // Add git diff context (truncated for AI token limits)
        if (includeGitDiff) {
            const diff = await getGitDiff(sourceBranch, targetBranch);
            if (diff) {
                const diffLines = diff.split("\n").slice(0, maxDiffLines);
                const truncatedDiff = diffLines.join("\n");
                prompt += `\n\nCode changes (showing first ${maxDiffLines} lines):\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;

                if (diff.split("\n").length > maxDiffLines) {
                    prompt += "\n... (diff truncated for brevity)";
                }
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not gather git context: ${error.message}`);
    }

    prompt += `\n\nPlease provide:
1. A concise, descriptive title for the merge request. In title do not use markdown
2. A detailed description that includes:
   - Summary of changes
   - Purpose/motivation for the changes
   - Any breaking changes or important notes
   - List of affected files
   - Testing considerations (if applicable)

Format the response with the title on the first line, followed by the description on subsequent lines.

`;

    return prompt;
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
