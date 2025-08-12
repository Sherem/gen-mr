// prompt-generator.mjs
// Handles AI prompt generation for merge requests

import {
    getGitDiff,
    getCommitMessages,
    getChangedFiles,
    getChangedFilesByType,
} from "./git-utils.mjs";

/**
 * Build the changed files section string listing Modified / Added / Deleted groups.
 * Always prefixes with two leading newlines and the header 'Changed files:'.
 * Returns a string starting with a newline so it can be concatenated directly.
 * @param {string[]} added
 * @param {string[]} modified
 * @param {string[]} deleted
 * @returns {string}
 */
const buildChangedFilesSection = (added, modified, deleted) => {
    const section = [];
    section.push("\n\nChanged files:");
    if (modified && modified.length) {
        section.push("Modified:");
        section.push(...modified.map((f) => `- ${f}`));
    }
    if (added && added.length) {
        section.push("Added:");
        section.push(...added.map((f) => `- ${f}`));
    }
    if (deleted && deleted.length) {
        section.push("Deleted:");
        section.push(...deleted.map((f) => `- ${f}`));
    }
    return `\n${section.join("\n")}`;
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
        additionalInstructions = "",
        previousResult = null,
    } = options;

    let prompt = `Generate a professional merge request title and description for merging '${sourceBranch}' into '${targetBranch}'.`;

    // Add previous result context if regenerating
    if (previousResult) {
        prompt += "\n\nPrevious merge request details:";
        prompt += `\nTitle: ${previousResult.title}`;
        prompt += `\nDescription: ${previousResult.description}`;
        prompt += "\nPlease improve upon this previous version.";
    }

    // Add additional user instructions if provided
    if (additionalInstructions && additionalInstructions.trim()) {
        prompt += `\n\nAdditional instructions from user:\n${additionalInstructions}`;
    }

    // Add JIRA tickets context
    if (jiraTickets && jiraTickets.trim()) {
        prompt += `\n\nRelated JIRA tickets: ${jiraTickets}`;
    }

    try {
        // Prepare fixed-position promise slots (null if feature disabled)
        const commitsPromise = includeCommitMessages
            ? getCommitMessages(sourceBranch, targetBranch)
            : null;
        const filesByTypePromise = includeChangedFiles
            ? getChangedFilesByType(sourceBranch, targetBranch)
            : null;
        const diffPromise = includeGitDiff ? getGitDiff(sourceBranch, targetBranch) : null;

        let commits = null;
        let filesByType = null;
        let diff = null;
        try {
            [commits, filesByType, diff] = await Promise.all([
                commitsPromise,
                filesByTypePromise,
                diffPromise,
            ]);
        } catch (gitErr) {
            // Normalize any git command failure to a common error message
            throw new Error(`one or more git commands failed: ${gitErr.message}`);
        }

        // Commit messages section (preserve ordering in output regardless of fetch order)
        if (includeCommitMessages) {
            if (Array.isArray(commits) && commits.length > 0) {
                prompt += `\n\nCommit messages:\n${commits.map((msg) => `- ${msg}`).join("\n")}`;
            } else if (Array.isArray(commits)) {
                prompt += `\n\nCommit messages: No commit messages found.`;
            } // if commits null (error), silently skip as before (covered by catch warning)
        }

        // Changed files section
        if (includeChangedFiles) {
            let added = [];
            let modified = [];
            let deleted = [];
            if (filesByType) {
                ({ added, modified, deleted } = filesByType);
            } else {
                // Fallback to flat list fetch only if classification failed
                const flat = await getChangedFiles(sourceBranch, targetBranch).catch(() => []);
                modified = flat; // treat all as modified if we lack type info
            }

            const total = (added?.length || 0) + (modified?.length || 0) + (deleted?.length || 0);
            prompt +=
                total > 0
                    ? buildChangedFilesSection(added, modified, deleted)
                    : `\n\nChanged files: No changed files found.`;
        }

        // Diff section
        if (includeGitDiff) {
            if (typeof diff === "string" && diff.length > 0) {
                const diffLines = diff.split("\n").slice(0, maxDiffLines);
                const truncatedDiff = diffLines.join("\n");
                prompt += `\n\nCode changes (showing first ${maxDiffLines} lines):\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
                if (diff.split("\n").length > maxDiffLines) {
                    prompt += "\n... (diff truncated for brevity)";
                }
            } else if (diff !== null) {
                // diff empty string
                prompt += "\n\nCode changes: No code changes found.";
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
      - List of updated files (if any)
      - List of added files (if any)
      - List of deleted files (if any)
   - Testing considerations (if applicable)

Description, should use markdown formatting. 
Every part should be clearly defined and separated. 
Use markdown headers for each section.

Format the response with the title on the first line, followed by the description on subsequent lines.

`;

    return prompt;
};

/**
 * Generate prompt with default options for merge requests
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs
 * @returns {Promise<string>} Generated prompt for AI
 */
export const generateDefaultPrompt = async (sourceBranch, targetBranch, jiraTickets = "") => {
    return generateMergeRequestPrompt(sourceBranch, targetBranch, jiraTickets, {
        includeGitDiff: true,
        includeCommitMessages: true,
        includeChangedFiles: true,
        maxDiffLines: 1000,
    });
};

/**
 * Generate a minimal prompt with basic information only
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs
 * @returns {Promise<string>} Generated minimal prompt for AI
 */
export const generateMinimalPrompt = async (sourceBranch, targetBranch, jiraTickets = "") => {
    return generateMergeRequestPrompt(sourceBranch, targetBranch, jiraTickets, {
        includeGitDiff: false,
        includeCommitMessages: true,
        includeChangedFiles: true,
        maxDiffLines: 0,
    });
};

/**
 * Generate a comprehensive prompt with extended diff for complex changes
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs
 * @returns {Promise<string>} Generated comprehensive prompt for AI
 */
export const generateComprehensivePrompt = async (sourceBranch, targetBranch, jiraTickets = "") => {
    return generateMergeRequestPrompt(sourceBranch, targetBranch, jiraTickets, {
        includeGitDiff: true,
        includeCommitMessages: true,
        includeChangedFiles: true,
        maxDiffLines: 2000,
    });
};
