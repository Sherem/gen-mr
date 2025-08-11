#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import {
    getConfig,
    getEditorCommand,
    editPullRequestContent,
    showCurrentConfig,
} from "./config/common.mjs";
import { configureChatGPTToken, showAiTokenConfigHelp } from "./ai/chatgpt.mjs";
import { setChatGPTModel, showChatGPTModelsHelp, CHATGPT_MODELS } from "./ai/chatgpt.mjs";
import { configureEditor, showEditorConfigHelp } from "./config/editor-config.mjs";
import { generateMergeRequestSafe, getDefaultPromptOptions } from "./merge-request-generator.mjs";
import { getCurrentBranch } from "./git-utils.mjs";

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
    console.log("  gen-mr <targetBranch> [jiraTickets]  # uses current branch as source");
    console.log("  gen-mr --create-ai-token <LLM> [--global | -g]");
    console.log("  gen-mr --use-model <model> [--global | -g]");
    console.log("  gen-mr --configure-editor [--global | -g]");
    console.log("  gen-mr --show-config [--global | -g]");
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
    console.log("  --show-config          Display current configuration");
    console.log("                         Use with --global to show only global config");
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
    console.log("  gen-mr --show-config");
    console.log("  gen-mr --show-config --global");
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

    // Handle show config
    if (argv["show-config"]) {
        const isGlobal = argv.global || argv.g;
        try {
            await showCurrentConfig(isGlobal);
            process.exit(0);
        } catch (error) {
            console.error("❌ Failed to show configuration:", error.message);
            process.exit(1);
        }
    }

    // Extract positional arguments with fallback behavior:
    // - If two+ args: [source, target, tickets]
    // - If one arg: [currentBranch, target, tickets]
    // - If zero: error
    let sourceBranch = positionalArgs[0];
    let targetBranch = positionalArgs[1];
    let jiraTickets = positionalArgs[2] || "";

    if (!sourceBranch && !targetBranch && positionalArgs.length === 0) {
        console.log("❌ Error: Missing required arguments");
        console.log(
            "💡 Provide either: <source> <target> or just <target> to use current branch as source"
        );
        showUsage();
        process.exit(1);
    }

    if (positionalArgs.length === 1) {
        try {
            const current = await getCurrentBranch();
            targetBranch = positionalArgs[0];
            sourceBranch = current;
            jiraTickets = "";
        } catch (error) {
            console.error("❌ Failed to detect current branch:", error.message);
            process.exit(1);
        }
    }

    // Final required arguments check
    if (!sourceBranch || !targetBranch) {
        console.log("❌ Error: Missing required arguments");
        console.log(
            "💡 Provide either: <source> <target> or just <target> to use current branch as source"
        );
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
                try {
                    console.log("🚀 Opening editor...");
                    const editedContent = await editPullRequestContent(
                        finalTitle,
                        finalDescription,
                        ".md"
                    );

                    finalTitle = editedContent.title;
                    finalDescription = editedContent.description;

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
