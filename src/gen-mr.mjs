#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import { showAiTokenConfigHelp, showChatGPTModelsHelp } from "./ai/chatgpt.mjs";
import { showEditorConfigHelp } from "./config/editor-config.mjs";
import { executePRWorkflow } from "./workflow.mjs";
import { createGitlabProvider } from "./repo-providers/gitlab-provider.mjs";
import { validateArguments, validateGitLabConfigAndRepository } from "./config/validation.mjs";
import { handleCommonCliFlags } from "./cli/common-cli-flags.mjs";

const argv = minimist(process.argv.slice(2), {
    alias: { g: "global" },
});

// Extract positional arguments (non-option arguments)
const positionalArgs = argv._;

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
    console.log(
        "  --remote <name>        Use a specific git remote instead of 'origin' (optional)"
    );
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
        return; // success path
    }

    // Handle all shared CLI flags
    if (await handleCommonCliFlags({ argv, toolName: "gen-mr" })) {
        return;
    }

    // Validate positional args and transform into structured args
    const args = await validateArguments({ positionalArgs, showUsage });

    // Determine remote name (default origin)
    const remoteNameArg = String(argv.remote || "").trim();
    const remoteName = remoteNameArg || "origin";

    // Config & repository validation (moved from validation module)
    let config;
    let gitlabRepo;
    try {
        const validationResult = await validateGitLabConfigAndRepository(remoteName);
        config = validationResult.config;
        gitlabRepo = validationResult.gitlabRepo;
    } catch (error) {
        throw new Error(error.message);
    }

    const repoProvider = createGitlabProvider({
        gitlabToken: config.gitlabToken,
        gitlabHost: config.gitlabHost,
    });
    await executePRWorkflow({ args, remoteName, config, repository: gitlabRepo, repoProvider });
};

main().catch((err) => {
    console.error("Error:", err.message);
    process.exit(1);
});
