#!/usr/bin/env node
// gen-pr.js
// CLI tool for creating GitHub pull requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import { getConfig, generatePrompt } from "./common.mjs";
import { configureGithubToken, showTokenConfigHelp } from "./token-config.mjs";
import {
    configureChatGPTToken,
    showAiTokenConfigHelp,
    setChatGPTModel,
    showChatGPTModelsHelp,
    CHATGPT_MODELS,
} from "./ai/chatgpt.mjs";

const argv = minimist(process.argv.slice(2), {
    alias: {
        g: "global",
    },
});

// Extract positional arguments (non-option arguments)
const positionalArgs = argv._;

const postToGithub = async (url, data, token) => {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `token ${token}`,
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
    console.log("\n📋 gen-pr - GitHub Pull Request Generator");
    console.log("=".repeat(45));
    console.log("Usage:");
    console.log("  gen-pr <sourceBranch> <targetBranch> [jiraTickets] [options]");
    console.log("  gen-pr --create-token [--global | -g]");
    console.log("  gen-pr --create-ai-token <LLM> [--global | -g]");
    console.log("  gen-pr --use-model <model> [--global | -g]");
    console.log("  gen-pr --help");
    console.log("");
    console.log("Arguments:");
    console.log("  sourceBranch           Source branch to merge from");
    console.log("  targetBranch           Target branch to merge into");
    console.log("  jiraTickets            Comma-separated JIRA ticket IDs (optional)");
    console.log("");
    console.log("Options:");
    console.log("  --create-token         Configure GitHub Personal Access Token");
    console.log("  --global, -g           Save token globally (use with --create-token)");
    console.log("  --create-ai-token      Configure AI provider token (e.g., ChatGPT)");
    console.log("                         Use with --global to save globally");
    console.log("  --use-model            Select AI model (ChatGPT models only for now)");
    console.log("                         Use with --global to save globally");
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
    console.log("");
    showTokenConfigHelp();
    showAiTokenConfigHelp();
    showChatGPTModelsHelp();
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

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    let config;
    try {
        config = await getConfig();
    } catch {
        console.log("❌ Error: No configuration found.");
        console.log("💡 Run 'gen-pr --create-token' to set up your GitHub token first.");
        rl.close();
        process.exit(1);
    }

    const { githubToken, openaiToken, githubRepo } = config;

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

    if (!githubRepo) {
        console.log("❌ Error: GitHub repository not found in configuration.");
        console.log("💡 Please add 'githubRepo' to your .gen-mr/config.json file.");
        console.log("   Example config format: owner/repository-name");
        rl.close();
        process.exit(1);
    }
    const model = config.openaiModel; // optional
    const aiResult = await generatePrompt(
        openaiToken,
        sourceBranch,
        targetBranch,
        jiraTickets,
        model
    );
    const [title, ...descArr] = aiResult.split("\n");
    const description = descArr.join("\n");
    console.log("\nGenerated Title:", title);
    console.log("Generated Description:", description);
    rl.question("Do you want to edit the title/description? (y/N): ", async (edit) => {
        let finalTitle = title;
        let finalDescription = description;
        if (edit.toLowerCase() === "y") {
            finalTitle = await new Promise((res) => rl.question("New Title: ", res));
            finalDescription = await new Promise((res) => rl.question("New Description: ", res));
        }
        // Create PR via GitHub API using native fetch
        try {
            const res = await postToGithub(
                `https://api.github.com/repos/${githubRepo}/pulls`,
                {
                    head: sourceBranch,
                    base: targetBranch,
                    title: finalTitle,
                    body: finalDescription,
                },
                githubToken
            );
            console.log("Pull request created:", res.html_url);
        } catch (err) {
            console.error("Failed to create pull request:", err.message);
        }
        rl.close();
    });
};

main();
