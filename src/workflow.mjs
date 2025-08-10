// workflow.mjs
// PR generation workflow extracted from gen-pr.mjs

import readline from "readline";
import {
    getConfig,
    getEditorCommand,
    editPullRequestContent,
    openInEditor,
} from "./config/common.mjs";
import { getRepositoryFromRemote } from "./git-utils.mjs";
import {
    generateMergeRequestSafe,
    getDefaultPromptOptions,
    generateMergeRequest,
} from "./merge-request-generator.mjs";
import { findExistingPullRequest, createOrUpdatePullRequest } from "./github-utils.mjs";

/**
 * Regenerate merge request with additional user instructions
 * @param {object} config - Configuration object
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - JIRA ticket IDs
 * @param {object} previousResult - Previously generated MR result
 * @param {object} options - Generation options
 * @returns {Promise<object>} Regenerated merge request data
 */
const regenerateMergeRequest = async (
    config,
    sourceBranch,
    targetBranch,
    jiraTickets,
    previousResult,
    options = {}
) => {
    console.log("🚀 Opening editor for additional instructions...");

    // Create template content with comments explaining usage
    const templateContent = `# Additional Instructions for Merge Request Generation
# 
# Lines starting with '#' are comments and will be ignored.
# Add any additional instructions below to customize the merge request.
# If you don't need any additional instructions, save and close this file.
#
# Examples:
# - Focus on security aspects
# - Emphasize performance improvements
# - Mention specific testing requirements
# - Add context about architectural decisions
#
# Your instructions:

`;

    try {
        // Open editor with template
        const userInput = await openInEditor(templateContent, ".txt");

        // Filter out comments (lines starting with #) and get user instructions
        const instructions = userInput
            .split("\n")
            .filter((line) => !line.trim().startsWith("#"))
            .join("\n")
            .trim();

        // Create enhanced prompt with previous result and user instructions
        const { promptOptions = {} } = options;
        const enhancedOptions = {
            ...promptOptions,
            additionalInstructions: instructions,
            previousResult: previousResult,
        };

        console.log("🔄 Regenerating with additional instructions...");

        return await generateMergeRequest(config, sourceBranch, targetBranch, jiraTickets, {
            ...options,
            promptOptions: enhancedOptions,
        });
    } catch (error) {
        console.error("❌ Error during regeneration:", error.message);
        throw error;
    }
};

/**
 * Handle user interaction with menu system for MR operations
 * @param {object} rl - Readline interface
 * @param {object} config - Configuration object
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 * @param {string} jiraTickets - JIRA ticket IDs
 * @param {object} initialResult - Initial MR generation result
 * @param {object} prConfig - PR configuration (repo, token, etc.)
 * @returns {Promise<void>}
 */
const handleUserInteraction = async (
    rl,
    config,
    sourceBranch,
    targetBranch,
    jiraTickets,
    initialResult,
    prConfig
) => {
    let currentResult = { ...initialResult };
    const originalResult = { ...initialResult };
    let hasChanges = false;

    const showMenu = async () => {
        console.log("\n" + "=".repeat(50));
        console.log("📋 What would you like to do?");
        console.log("=".repeat(50));
        console.log("1. 💾 Save/Update this merge request");
        console.log("2. ✏️  Edit title and description");
        console.log("3. 🔄 Regenerate with additional instructions");

        if (hasChanges) {
            console.log("4. ↩️  Rollback to original version");
        }

        console.log("=".repeat(50));

        const maxOption = hasChanges ? "4" : "3";

        return new Promise((resolve) => {
            rl.question(`Choose an option (1-${maxOption}): `, (choice) => {
                resolve(choice.trim());
            });
        });
    };

    const editWithEditor = async () => {
        const editorCommand = await getEditorCommand();

        if (editorCommand) {
            try {
                console.log("🚀 Opening editor...");
                const editedContent = await editPullRequestContent(
                    currentResult.title,
                    currentResult.description,
                    ".md"
                );

                currentResult.title = editedContent.title;
                currentResult.description = editedContent.description;
                hasChanges = true;

                console.log("✅ Content updated from editor");
                showCurrentResult();
            } catch (error) {
                console.error("❌ Editor error:", error.message);
                console.log("💡 Falling back to manual input");
                await editManually();
            }
        } else {
            await editManually();
        }
    };

    const editManually = async () => {
        return new Promise((resolve) => {
            rl.question("New Title: ", (title) => {
                rl.question("New Description: ", (description) => {
                    currentResult.title = title || currentResult.title;
                    currentResult.description = description || currentResult.description;
                    hasChanges = true;
                    console.log("✅ Content updated manually");
                    showCurrentResult();
                    resolve();
                });
            });
        });
    };

    const regenerateWithInstructions = async () => {
        try {
            const regeneratedResult = await regenerateMergeRequest(
                config,
                sourceBranch,
                targetBranch,
                jiraTickets,
                { title: currentResult.title, description: currentResult.description },
                {
                    aiModel: initialResult.aiModel,
                    promptOptions: initialResult.promptOptions || getDefaultPromptOptions(),
                }
            );

            currentResult.title = regeneratedResult.title;
            currentResult.description = regeneratedResult.description;
            hasChanges = true;

            console.log("\n" + "=".repeat(60));
            console.log("🔄 Regenerated Pull Request");
            console.log("=".repeat(60));
            showCurrentResult();
        } catch (error) {
            console.error("❌ Failed to regenerate:", error.message);
            console.log("💡 Continuing with current content...");
        }
    };

    const rollbackToOriginal = () => {
        currentResult = { ...originalResult };
        hasChanges = false;
        console.log("↩️ Rolled back to original version");
        showCurrentResult();
    };

    const showCurrentResult = () => {
        console.log(`\n🏷️  Title: ${currentResult.title}`);
        console.log(`\n📄 Description:\n${currentResult.description}`);
        console.log("=".repeat(60));
    };

    const saveMergeRequest = async () => {
        try {
            await createOrUpdatePullRequest({
                githubRepo: prConfig.githubRepo,
                sourceBranch,
                targetBranch,
                title: currentResult.title,
                description: currentResult.description,
                githubToken: prConfig.githubToken,
                existingPR: prConfig.existingPR,
            });
        } catch {
            // Error handling is already done in createOrUpdatePullRequest
        }
        rl.close();
    };

    // Main interaction loop
    while (true) {
        const choice = await showMenu();

        switch (choice) {
            case "1":
                await saveMergeRequest();
                return;
            case "2":
                await editWithEditor();
                break;
            case "3":
                await regenerateWithInstructions();
                break;
            case "4":
                if (hasChanges) {
                    rollbackToOriginal();
                } else {
                    console.log("❌ Invalid option. Please choose 1-3.");
                }
                break;
            default:
                console.log(`❌ Invalid option. Please choose 1-${hasChanges ? "4" : "3"}.`);
                break;
        }
    }
};

/**
 * Main PR generation workflow
 * @param {string} sourceBranch - Source branch to merge from
 * @param {string} targetBranch - Target branch to merge into
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs (optional)
 * @returns {Promise<void>}
 */
export const executePRWorkflow = async (sourceBranch, targetBranch, jiraTickets = "") => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        // Get configuration
        let config;
        try {
            config = await getConfig();
        } catch {
            console.log("❌ Error: No configuration found.");
            console.log("💡 Run 'gen-pr --create-token' to set up your GitHub token first.");
            rl.close();
            process.exit(1);
        }

        const { githubToken, openaiToken } = config;

        if (!githubToken) {
            console.log("❌ Error: GitHub token not found in configuration.");
            console.log("💡 Run 'gen-pr --create-token' to set up your GitHub token.");
            rl.close();
            process.exit(1);
        }

        if (!openaiToken) {
            console.log("❌ Error: OpenAI token not found in configuration.");
            console.log("💡 Please add 'openaiToken' to your .gen-mr/config.json file.");
            rl.close();
            process.exit(1);
        }

        // Detect repository type from git remote
        let repoInfo;
        try {
            repoInfo = await getRepositoryFromRemote();
        } catch (error) {
            console.log("❌ Error: Failed to detect repository from git remote.");
            console.log(`💡 ${error.message}`);
            console.log(
                "💡 Make sure you're in a git repository with an origin remote configured."
            );
            rl.close();
            process.exit(1);
        }

        // Check repository type and provide appropriate suggestions
        if (repoInfo.type === "gitlab") {
            console.log("🦊 GitLab repository detected!");
            console.log("💡 For GitLab repositories, consider using gen-mr instead of gen-pr.");
            console.log(`   Repository: ${repoInfo.fullName} on ${repoInfo.hostname}`);
            rl.close();
            process.exit(1);
        } else if (repoInfo.type === "unknown") {
            console.log("❌ Error: Unknown repository type detected.");
            console.log(`   Repository host: ${repoInfo.hostname}`);
            console.log("💡 This tool currently supports GitHub repositories only.");
            console.log("💡 For GitLab repositories, use gen-mr instead.");
            rl.close();
            process.exit(1);
        } else if (repoInfo.type !== "github") {
            console.log("❌ Error: Unsupported repository type.");
            console.log(`   Repository host: ${repoInfo.hostname}`);
            console.log("💡 This tool supports GitHub repositories only.");
            rl.close();
            process.exit(1);
        }

        const githubRepo = repoInfo.fullName;

        // Check if a pull request already exists for these branches
        console.log("🔍 Checking for existing pull requests...");
        const existingPR = await findExistingPullRequest(
            githubRepo,
            sourceBranch,
            targetBranch,
            githubToken
        );

        if (existingPR) {
            console.log("📋 Found existing pull request:");
            console.log(`   Title: ${existingPR.title}`);
            console.log(`   URL: ${existingPR.html_url}`);
            console.log(`   Status: ${existingPR.state}`);

            const updateChoice = await new Promise((res) =>
                rl.question(
                    "Do you want to update the existing PR with new AI-generated content? (y/N): ",
                    res
                )
            );

            if (updateChoice.toLowerCase() !== "y") {
                console.log("❌ Operation cancelled. Existing PR will remain unchanged.");
                rl.close();
                process.exit(0);
            }

            console.log("🔄 Will update existing pull request...");
        }

        // Generate merge request using the new modular approach
        let result;
        try {
            console.log("🔍 Generating AI-powered pull request...");

            const promptOptions = getDefaultPromptOptions({
                includeGitDiff: true,
                includeCommitMessages: true,
                includeChangedFiles: true,
            });

            result = await generateMergeRequestSafe(
                config,
                sourceBranch,
                targetBranch,
                jiraTickets,
                {
                    aiModel: "ChatGPT",
                    promptOptions,
                    verbose: true,
                }
            );

            console.log("\n" + "=".repeat(60));
            const actionText = existingPR ? "Updated Pull Request" : "Generated Pull Request";
            console.log(`📝 ${actionText}`);
            console.log("=".repeat(60));
            console.log(`\n🏷️  Title: ${result.title}`);
            console.log(`\n📄 Description:\n${result.description}`);
            console.log(`\n🤖 Generated using: ${result.aiModel} (${result.model})`);
            console.log("=".repeat(60));
        } catch (error) {
            console.error("❌ Failed to generate pull request:", error.message);
            rl.close();
            process.exit(1);
        }

        // Handle user interaction with menu system
        await handleUserInteraction(rl, config, sourceBranch, targetBranch, jiraTickets, result, {
            githubRepo,
            githubToken,
            existingPR,
        });
    } catch (error) {
        console.error("❌ Workflow error:", error.message);
        rl.close();
        process.exit(1);
    }
};
