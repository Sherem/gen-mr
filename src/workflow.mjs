// workflow.mjs
// PR generation workflow extracted from gen-pr.mjs

import readline from "readline";
import { getConfig, getEditorCommand, openInEditor } from "./config/common.mjs";
import { getRepositoryFromRemote } from "./git-utils.mjs";
import { generateMergeRequestSafe, getDefaultPromptOptions } from "./merge-request-generator.mjs";
import { findExistingPullRequest, createOrUpdatePullRequest } from "./github-utils.mjs";

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

        // Handle user interaction for editing and creating/updating PR
        const editorCommand = await getEditorCommand();
        const hasEditor = editorCommand !== null;

        const editPrompt = hasEditor
            ? "Do you want to edit the title/description? (y/N/e for editor): "
            : "Do you want to edit the title/description? (y/N): ";

        rl.question(editPrompt, async (edit) => {
            let finalTitle = result.title;
            let finalDescription = result.description;

            if (edit.toLowerCase() === "y") {
                finalTitle = await new Promise((res) => rl.question("New Title: ", res));
                finalDescription = await new Promise((res) =>
                    rl.question("New Description: ", res)
                );
            } else if (hasEditor && edit.toLowerCase() === "e") {
                try {
                    console.log("🚀 Opening editor...");
                    const editorContent = `${finalTitle}\n\n---\n\n${finalDescription}`;
                    const editedContent = await openInEditor(editorContent, ".md");

                    // Parse the edited content back into title and description
                    const lines = editedContent.split("\n");
                    const separatorIndex = lines.findIndex((line) => line.trim() === "---");

                    if (separatorIndex !== -1) {
                        finalTitle = lines.slice(0, separatorIndex).join("\n").trim();
                        finalDescription = lines
                            .slice(separatorIndex + 1)
                            .join("\n")
                            .trim();
                    } else {
                        // If no separator found, treat first line as title, rest as description
                        finalTitle = lines[0] || finalTitle;
                        finalDescription = lines.slice(1).join("\n").trim() || finalDescription;
                    }

                    console.log("✅ Content updated from editor");
                } catch (error) {
                    console.error("❌ Editor error:", error.message);
                    console.log("💡 Falling back to original content");
                }
            }

            try {
                await createOrUpdatePullRequest({
                    githubRepo,
                    sourceBranch,
                    targetBranch,
                    title: finalTitle,
                    description: finalDescription,
                    githubToken,
                    existingPR,
                });
            } catch {
                // Error handling is already done in createOrUpdatePullRequest
            }
            rl.close();
        });
    } catch (error) {
        console.error("❌ Workflow error:", error.message);
        rl.close();
        process.exit(1);
    }
};
