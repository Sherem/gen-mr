#!/usr/bin/env node
// gen-pr.js
// CLI tool for creating GitHub pull requests with AI-generated name/description

import minimist from "minimist";
import { configureGithubToken, showTokenConfigHelp } from "./config/token-config.mjs";
import { configureEditor, showEditorConfigHelp } from "./config/editor-config.mjs";
import { showCurrentConfig } from "./config/common.mjs";
import {
    showAiTokenConfigHelp,
    setChatGPTModel,
    showChatGPTModelsHelp,
    CHATGPT_MODELS,
} from "./ai/chatgpt.mjs";
import { createAiToken } from "./ai/create-ai-token.mjs";
import { executePRWorkflow } from "./workflow.mjs";
import { createGithubProvider } from "./repo-providers/github-provider.mjs";
import { validateArguments, validateGitHubConfigAndRepository } from "./config/validation.mjs";

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
        return; // success path
    }

    // Handle token configuration
    if (argv["create-token"]) {
        try {
            await configureGithubToken(argv.global || argv.g);
            return; // success
        } catch (error) {
            throw new Error(`Token configuration failed: ${error.message}`);
        }
    }

    // Handle editor configuration
    if (argv["configure-editor"]) {
        try {
            await configureEditor(argv.global || argv.g);
            return; // success
        } catch (error) {
            throw new Error(`Editor configuration failed: ${error.message}`);
        }
    }

    // Handle AI token configuration
    if (argv["create-ai-token"]) {
        const llmRaw = argv["create-ai-token"]; // expects a value like "ChatGPT"
        const isGlobal = argv.global || argv.g;
        await createAiToken({ llmRaw, isGlobal, toolName: "gen-pr" });
        return; // success
    }

    // Handle model selection
    if (argv["use-model"]) {
        const modelRaw = argv["use-model"]; // expects a value like "gpt-4o"
        const isGlobal = argv.global || argv.g;
        try {
            await setChatGPTModel(String(modelRaw), isGlobal);
            return; // success
        } catch (error) {
            console.log("ℹ️  Supported models:", CHATGPT_MODELS.join(", "));
            throw new Error(`Failed to set model: ${error.message}`);
        }
    }

    // Handle show config
    if (argv["show-config"]) {
        const isGlobal = argv.global || argv.g;
        try {
            await showCurrentConfig(isGlobal);
            return; // success
        } catch (error) {
            throw new Error(`Failed to show configuration: ${error.message}`);
        }
    }

    // Validate positional args and transform into structured args
    const args = await validateArguments({ positionalArgs, showUsage });

    // Determine remote name (default origin)
    const remoteNameArg = String(argv.remote || "").trim();
    const remoteName = remoteNameArg || "origin";

    // Config & repository validation (moved from validation module)
    let config;
    let githubRepo;
    try {
        const validationResult = await validateGitHubConfigAndRepository(remoteName);
        config = validationResult.config;
        githubRepo = validationResult.githubRepo;
    } catch (error) {
        throw new Error(error.message);
    }

    const repoProvider = createGithubProvider({ githubToken: config.githubToken });
    await executePRWorkflow({ args, remoteName, config, repository: githubRepo, repoProvider });
};

main().catch((error) => {
    console.error("❌ Error:", error.message);
    process.exit(1);
});
