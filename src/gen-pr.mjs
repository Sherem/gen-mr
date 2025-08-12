#!/usr/bin/env node
// gen-pr.js
// CLI tool for creating GitHub pull requests with AI-generated name/description

import minimist from "minimist";
import { configureGithubToken, showTokenConfigHelp } from "./config/token-config.mjs";
import { configureEditor, showEditorConfigHelp } from "./config/editor-config.mjs";
import { showCurrentConfig } from "./config/common.mjs";
import {
    configureChatGPTToken,
    showAiTokenConfigHelp,
    setChatGPTModel,
    showChatGPTModelsHelp,
    CHATGPT_MODELS,
} from "./ai/chatgpt.mjs";
import { executePRWorkflow } from "./workflow.mjs";

const argv = minimist(process.argv.slice(2), {
    alias: {
        g: "global",
    },
});

// Extract positional arguments (non-option arguments)
const positionalArgs = argv._;

const showUsage = () => {
    console.log("\n📋 gen-pr - GitHub Pull Request Generator");
    console.log("=".repeat(45));
    console.log("Usage:");
    console.log("  gen-pr <sourceBranch> <targetBranch> [jiraTickets] [options]");
    console.log("  gen-pr <targetBranch> [jiraTickets] [options]  # uses current branch as source");
    console.log("  gen-pr --create-token [--global | -g]");
    console.log("  gen-pr --create-ai-token <LLM> [--global | -g]");
    console.log("  gen-pr --use-model <model> [--global | -g]");
    console.log("  gen-pr --configure-editor [--global | -g]");
    console.log("  gen-pr --show-config [--global | -g]");
    console.log("  gen-pr --help");
    console.log("");
    console.log("Arguments:");
    console.log("  sourceBranch           Source branch to merge from");
    console.log("  targetBranch           Target branch to merge into");
    console.log("  jiraTickets            Comma-separated JIRA ticket IDs (optional)");
    console.log("");
    console.log("Behavior:");
    console.log("  If an existing PR is found for the given branches, you will be prompted with:");
    console.log("  1. Regenerate PR (fresh generation)");
    console.log("  2. Regenerate existing PR with additional instructions");
    console.log("  3. Cancel");
    console.log("");
    console.log("Options:");
    console.log("  --create-token         Configure GitHub Personal Access Token");
    console.log("  --global, -g           Save token globally (use with --create-token)");
    console.log("  --create-ai-token      Configure AI provider token (e.g., ChatGPT)");
    console.log("                         Use with --global to save globally");
    console.log("  --use-model            Select AI model (ChatGPT models only for now)");
    console.log("                         Use with --global to save globally");
    console.log("  --configure-editor     Configure editor command for advanced editing");
    console.log("                         Use with --global to save globally");
    console.log("  --show-config          Display current configuration");
    console.log("                         Use with --global to show only global config");
    console.log(
        "  --remote <name>        Use a specific git remote instead of 'origin' (optional)"
    );
    console.log("  --help                 Show this help message");
    console.log("");
    console.log("Examples:");
    console.log("  gen-pr feature/new-ui main");
    console.log("  gen-pr feature/login develop PROJ-123,PROJ-456");
    console.log("  gen-pr --create-token");
    console.log("  gen-pr --create-token --global");
    console.log("  gen-pr --create-ai-token ChatGPT");
    console.log("  gen-pr --create-ai-token ChatGPT --global");
    console.log("  gen-pr --use-model gpt-4o");
    console.log("  gen-pr --configure-editor");
    console.log("  gen-pr --configure-editor --global");
    console.log("  gen-pr --show-config");
    console.log("  gen-pr --show-config --global");
    console.log("");
    showTokenConfigHelp();
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

    // Handle token configuration
    if (argv["create-token"]) {
        try {
            await configureGithubToken(argv.global || argv.g);
            process.exit(0);
        } catch (error) {
            console.error("❌ Token configuration failed:", error.message);
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

    // Handle AI token configuration
    if (argv["create-ai-token"]) {
        const llmRaw = argv["create-ai-token"]; // expects a value like "ChatGPT"
        const llm = String(llmRaw || "")
            .trim()
            .toLowerCase();
        const isGlobal = argv.global || argv.g;

        // Supported aliases mapping to ChatGPT
        const chatgptAliases = new Set(["chatgpt", "openai", "gpt", "gpt-3.5", "gpt-4", "gpt-4o"]);

        if (!llm) {
            console.error("❌ Missing LLM argument. Example: gen-pr --create-ai-token ChatGPT");
            process.exit(1);
        }

        try {
            if (chatgptAliases.has(llm)) {
                await configureChatGPTToken(isGlobal);
            } else {
                console.error(
                    `❌ Unsupported LLM '${llmRaw}'. Only ChatGPT is implemented at the moment.`
                );
                console.log("ℹ️  Try: gen-pr --create-ai-token ChatGPT");
                process.exit(1);
            }
            process.exit(0);
        } catch (error) {
            console.error("❌ AI token configuration failed:", error.message);
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

    // Map positional arguments to named args for validation/workflow
    const args = {
        sourceBranch: positionalArgs[0],
        targetBranch: positionalArgs[1],
        jiraTickets: positionalArgs[2],
    };

    await executePRWorkflow({ options: argv, args, showUsage });
};

main().catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
});
