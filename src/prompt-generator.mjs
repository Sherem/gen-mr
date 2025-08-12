// prompt-generator.mjs
// Handles AI prompt generation for merge requests

import { getGitDiff, getCommitMessages, getChangedFiles } from "./git-utils.mjs";

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
        // Add commit messages context
        if (includeCommitMessages) {
            const commits = await getCommitMessages(sourceBranch, targetBranch);
            if (commits.length > 0) {
                prompt += `\n\nCommit messages:\n${commits.map((msg) => `- ${msg}`).join("\n")}`;
            } else {
                prompt += `\n\nCommit messages: No commit messages found.`;
            }
        }

        // Add changed files context
        if (includeChangedFiles) {
            const files = await getChangedFiles(sourceBranch, targetBranch);
            if (files.length > 0) {
                prompt += `\n\nChanged files:\n${files.map((file) => `- ${file}`).join("\n")}`;
            } else {
                prompt += `\n\nChanged files: No changed files found.`;
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
            } else {
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
