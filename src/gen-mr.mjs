#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import { getConfig, getEditorCommand, openInEditor } from "./config/common.mjs";
import { configureChatGPTToken, showAiTokenConfigHelp } from "./ai/chatgpt.mjs";
import { setChatGPTModel, showChatGPTModelsHelp, CHATGPT_MODELS } from "./ai/chatgpt.mjs";
import { configureEditor, showEditorConfigHelp } from "./config/editor-config.mjs";
import { generateMergeRequestSafe, getDefaultPromptOptions } from "./merge-request-generator.mjs";

const argv = minimist(process.argv.slice(2), {
    alias: { g: "global" },
});

// Extract positional arguments (non-option arguments)
const positionalArgs = argv._;

const postToGitlab = async (url, data, token) => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "PRIVATE-TOKEN": token,
        },
        body: JSON.stringify(data),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    return response.json();
};

const showUsage = () => {
    console.log("\n📋 gen-mr - GitLab Merge Request Generator");
    console.log("=".repeat(45));
    console.log("Usage:");
    console.log("  gen-mr <sourceBranch> <targetBranch> [jiraTickets]");
    console.log("  gen-mr --create-ai-token <LLM> [--global | -g]");
    console.log("  gen-mr --use-model <model> [--global | -g]");
    console.log("  gen-mr --configure-editor [--global | -g]");
    console.log("  gen-mr --help");
    console.log("");
    console.log("Arguments:");
    console.log("  sourceBranch           Source branch to merge from");
    console.log("  targetBranch           Target branch to merge into");
    console.log("  jiraTickets            Comma-separated JIRA ticket IDs (optional)");
    console.log("");
    console.log("Options:");
    console.log("  --create-ai-token      Configure AI provider token (e.g., ChatGPT)");
    console.log("                         Use with --global to save globally");
    console.log("  --use-model            Select AI model (ChatGPT models only for now)");
    console.log("                         Use with --global to save globally");
    console.log("  --configure-editor     Configure editor command for advanced editing");
    console.log("                         Use with --global to save globally");
    console.log("  --help                 Show this help message");
    console.log("");
    console.log("Examples:");
    console.log("  gen-mr feature/new-ui main");
    console.log("  gen-mr feature/login develop PROJ-123,PROJ-456");
    console.log("  gen-mr --create-ai-token ChatGPT");
    console.log("  gen-mr --create-ai-token ChatGPT --global");
    console.log("  gen-mr --use-model gpt-4o");
    console.log("  gen-mr --configure-editor");
    console.log("  gen-mr --configure-editor --global");
    console.log("");
    showAiTokenConfigHelp();
    showChatGPTModelsHelp();
    showEditorConfigHelp();
};

const main = async () => {
    // Handle help
    if (argv.help) {
        showUsage();
        process.exit(0);
    }

    // Handle AI token configuration
    if (argv["create-ai-token"]) {
        const llmRaw = argv["create-ai-token"]; // expects a value like "ChatGPT"
        const llm = String(llmRaw || "")
            .trim()
            .toLowerCase();
        const isGlobal = argv.global || argv.g;

        const chatgptAliases = new Set(["chatgpt", "openai", "gpt", "gpt-3.5", "gpt-4", "gpt-4o"]);

        if (!llm) {
            console.error("❌ Missing LLM argument. Example: gen-mr --create-ai-token ChatGPT");
            process.exit(1);
        }

        try {
            if (chatgptAliases.has(llm)) {
                await configureChatGPTToken(isGlobal);
            } else {
                console.error(
                    `❌ Unsupported LLM '${llmRaw}'. Only ChatGPT is implemented at the moment.`
                );
                console.log("ℹ️  Try: gen-mr --create-ai-token ChatGPT");
                process.exit(1);
            }
            process.exit(0);
        } catch (error) {
            console.error("❌ AI token configuration failed:", error.message);
            process.exit(1);
        }
    }

    // Handle editor configuration
    if (argv["configure-editor"]) {
        try {
            await configureEditor(argv.global || argv.g);
            process.exit(0);
        } catch (error) {
            console.error("❌ Editor configuration failed:", error.message);
            process.exit(1);
        }
    }

    // Handle model selection
    if (argv["use-model"]) {
        const modelRaw = argv["use-model"]; // expects a value like "gpt-4o"
        const isGlobal = argv.global || argv.g;
        try {
            await setChatGPTModel(String(modelRaw), isGlobal);
            process.exit(0);
        } catch (error) {
            console.error("❌ Failed to set model:", error.message);
            console.log("ℹ️  Supported models:", CHATGPT_MODELS.join(", "));
            process.exit(1);
        }
    }

    // Extract positional arguments
    const sourceBranch = positionalArgs[0];
    const targetBranch = positionalArgs[1];
    const jiraTickets = positionalArgs[2] || "";

    // Check for required arguments
    if (!sourceBranch || !targetBranch) {
        console.log("❌ Error: Missing required arguments");
        console.log("💡 You need to provide source and target branches");
        showUsage();
        process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let config;
    try {
        config = await getConfig();
    } catch {
        console.log("❌ Error: No configuration found.");
        console.log("💡 Run 'gen-mr --create-ai-token ChatGPT' to set up your OpenAI token first.");
        rl.close();
        process.exit(1);
    }

    const { gitlabToken, openaiToken, gitlabUrl } = config;

    if (!openaiToken) {
        console.log("❌ Error: OpenAI token not found in configuration.");
        console.log(
            "💡 Run 'gen-mr --create-ai-token ChatGPT' to set up your OpenAI token, or add 'openaiToken' to your .gen-mr/config.json file."
        );
        rl.close();
        process.exit(1);
    }

    // Generate merge request using the new modular approach
    let result;
    try {
        console.log("🔍 Generating AI-powered merge request...");

        const promptOptions = getDefaultPromptOptions({
            includeGitDiff: true,
            includeCommitMessages: true,
            includeChangedFiles: true,
        });

        result = await generateMergeRequestSafe(config, sourceBranch, targetBranch, jiraTickets, {
            aiModel: "ChatGPT",
            promptOptions,
            verbose: true,
        });

        console.log("\n" + "=".repeat(60));
        console.log("📝 Generated Merge Request");
        console.log("=".repeat(60));
        console.log(`\n🏷️  Title: ${result.title}`);
        console.log(`\n📄 Description:\n${result.description}`);
        console.log(`\n🤖 Generated using: ${result.aiModel} (${result.model})`);
        console.log("=".repeat(60));
    } catch (error) {
        console.error("❌ Failed to generate merge request:", error.message);
        rl.close();
        process.exit(1);
    }

    rl.question("Do you want to edit the title/description? (y/N): ", async (edit) => {
        let finalTitle = result.title;
        let finalDescription = result.description;

        const editorCommand = await getEditorCommand();
        const hasEditor = editorCommand !== null;

        if (edit.toLowerCase() === "y") {
            if (hasEditor) {
                const useEditor = await new Promise((res) =>
                    rl.question("Use editor for editing? (y/N): ", res)
                );

                if (useEditor.toLowerCase() === "y") {
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
                        console.log("💡 Falling back to manual input");
                        finalTitle = await new Promise((res) => rl.question("New Title: ", res));
                        finalDescription = await new Promise((res) =>
                            rl.question("New Description: ", res)
                        );
                    }
                } else {
                    finalTitle = await new Promise((res) => rl.question("New Title: ", res));
                    finalDescription = await new Promise((res) =>
                        rl.question("New Description: ", res)
                    );
                }
            } else {
                finalTitle = await new Promise((res) => rl.question("New Title: ", res));
                finalDescription = await new Promise((res) =>
                    rl.question("New Description: ", res)
                );
            }
        }
        // Create MR via GitLab API using native fetch
        try {
            const res = await postToGitlab(
                `${gitlabUrl}/api/v4/projects/${config.gitlabProjectId}/merge_requests`,
                {
                    source_branch: sourceBranch,
                    target_branch: targetBranch,
                    title: finalTitle,
                    description: finalDescription,
                },
                gitlabToken
            );
            console.log("Merge request created:", res.web_url);
        } catch (err) {
            console.error("Failed to create merge request:", err.message);
        }
        rl.close();
    });
};

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
