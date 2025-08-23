#!/usr/bin/env node
// gen-pr.js
// CLI tool for creating GitHub pull requests with AI-generated name/description

import minimist from "minimist";
import { showTokenConfigHelp } from "./config/token-config.mjs";
import { showEditorConfigHelp } from "./config/editor-config.mjs";
import { showAiTokenConfigHelp, showChatGPTModelsHelp } from "./ai/chatgpt.mjs";
import { executePRWorkflow } from "./workflow.mjs";
import { createGithubProvider } from "./repo-providers/github-provider.mjs";
import { validateArguments, validateGitHubConfigAndRepository } from "./config/validation.mjs";
import { handleCommonCliFlags } from "./cli/common-cli-flags.mjs";

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

    // Handle all shared CLI flags
    if (await handleCommonCliFlags({ argv, toolName: "gen-pr" })) {
        return;
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
