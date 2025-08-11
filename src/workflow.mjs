// workflow.mjs
// PR generation workflow extracted from gen-pr.mjs

import readline from "readline";
import { getEditorCommand, editPullRequestContent, openInEditor } from "./config/common.mjs";
import {
    generateMergeRequestSafe,
    getDefaultPromptOptions,
    generateMergeRequest,
} from "./merge-request-generator.mjs";
import { findExistingPullRequest, createOrUpdatePullRequest } from "./github-utils.mjs";
import { formatSourceBranchDisplay } from "./utils/branch-format.mjs";

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
            console.log("5. ❌ Cancel (exit without saving)");
        } else {
            console.log("4. ❌ Cancel (exit without saving)");
        }

        console.log("=".repeat(50));

        const maxOption = hasChanges ? "5" : "4";

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
                // Use tracked remote branch for GitHub API operations
                sourceBranch: prConfig.remoteSourceBranch || sourceBranch,
                targetBranch: prConfig.remoteTargetBranch || targetBranch,
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
                    // Cancel option when no changes
                    console.log("❌ Operation cancelled. Exiting without saving.");
                    rl.close();
                    process.exit(0);
                }
                break;
            case "5":
                if (hasChanges) {
                    // Cancel option when there are changes
                    console.log("❌ Operation cancelled. Exiting without saving.");
                    rl.close();
                    process.exit(0);
                } else {
                    console.log(`❌ Invalid option. Please choose 1-4.`);
                }
                break;
            default:
                console.log(`❌ Invalid option. Please choose 1-${hasChanges ? "5" : "4"}.`);
                break;
        }
    }
};

/**
 * Main PR generation workflow
 * @param {string} sourceBranch - Source branch to merge from
 * @param {string} targetBranch - Target branch to merge into
 * @param {string} jiraTickets - Comma-separated JIRA ticket IDs (optional)
 * @param {object} config - Configuration object containing tokens
 * @param {string} githubRepo - GitHub repository name in format "owner/repo"
 * @returns {Promise<void>}
 */
export const executePRWorkflow = async (
    sourceBranch,
    targetBranch,
    jiraTickets = "",
    config,
    githubRepo,
    remoteSourceBranch,
    remoteTargetBranch,
    remoteName
) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        const { githubToken } = config;

        const promptOptions = getDefaultPromptOptions({
            includeGitDiff: true,
            includeCommitMessages: true,
            includeChangedFiles: true,
        });

        // Check if a pull request already exists for these branches
        console.log("🔍 Checking for existing pull requests...");
        const existingPR = await findExistingPullRequest(
            githubRepo,
            remoteSourceBranch || sourceBranch,
            remoteTargetBranch || targetBranch,
            githubToken
        );

        let result;

        if (existingPR) {
            const displaySource = formatSourceBranchDisplay(
                remoteSourceBranch || sourceBranch,
                remoteName,
                remoteSourceBranch
            );
            const displayTarget = formatSourceBranchDisplay(
                targetBranch,
                remoteName,
                remoteTargetBranch || targetBranch
            );
            console.log("📋 Found existing pull request:");
            console.log(`🔍 Source → target: ${displaySource} → ${displayTarget}`);
            console.log(`   URL: ${existingPR.html_url}`);
            console.log(`   Status: ${existingPR.state}`);
            console.log(`   Title: ${existingPR.title}`);
            console.log(`   Description:\n${existingPR.body || ""}`);
            console.log("");

            console.log("What would you like to do?");
            console.log("1. 🔄 Regenerate PR (fresh generation)");
            console.log("2. 🔄 Regenerate existing PR with additional instructions");
            console.log("3. ❌ Cancel");

            const choice = await new Promise((res) => rl.question("Choose an option (1-3): ", res));

            switch (choice.trim()) {
                case "1":
                    console.log("🔄 Will regenerate with fresh content...");
                    result = await generateMergeRequestSafe(
                        config,
                        sourceBranch,
                        targetBranch,
                        jiraTickets,
                        {
                            aiModel: "ChatGPT",
                            promptOptions,
                            verbose: true,
                            remoteSourceBranch,
                            remoteTargetBranch,
                            remoteName,
                        }
                    );
                    break;
                case "2":
                    console.log("🔄 Will regenerate existing PR with additional instructions...");
                    // Use regenerateMergeRequest function to handle editor and instructions
                    try {
                        // Create a temporary result object with existing PR data
                        result = await regenerateMergeRequest(
                            config,
                            sourceBranch,
                            targetBranch,
                            jiraTickets,
                            { title: existingPR.title, description: existingPR.body || "" },
                            {
                                aiModel: "ChatGPT",
                                promptOptions: promptOptions || getDefaultPromptOptions(),
                            }
                        );
                    } catch (error) {
                        console.error("❌ Failed to regenerate with instructions:", error.message);
                        console.log("💡 Falling back to fresh generation...");
                        // Continue with fresh generation as fallback
                    }
                    break;
                case "3":
                default:
                    console.log("❌ Operation cancelled. Existing PR will remain unchanged.");
                    rl.close();
                    process.exit(0);
            }
        } else {
            // Generate merge request using the new modular approach

            console.log("🔍 Generating AI-powered pull request...");

            result = await generateMergeRequestSafe(
                config,
                sourceBranch,
                targetBranch,
                jiraTickets,
                {
                    aiModel: "ChatGPT",
                    promptOptions,
                    verbose: true,
                    remoteSourceBranch,
                    remoteTargetBranch,
                    remoteName,
                }
            );
        }

        console.log("\n" + "=".repeat(60));
        const actionText = existingPR ? "Updated Pull Request" : "Generated Pull Request";
        console.log(`📝 ${actionText}`);
        console.log("=".repeat(60));
        console.log(`\n🏷️  Title: ${result.title}`);
        console.log(`\n📄 Description:\n${result.description}`);
        console.log(`\n🤖 Generated using: ${result.aiModel} (${result.model})`);
        console.log("=".repeat(60));

        // Handle user interaction with menu system
        await handleUserInteraction(rl, config, sourceBranch, targetBranch, jiraTickets, result, {
            githubRepo,
            githubToken,
            existingPR,
            remoteSourceBranch,
            remoteTargetBranch,
        });
    } catch (error) {
        console.error("❌ Workflow error:", error.message);
        rl.close();
        process.exit(1);
    }
};
