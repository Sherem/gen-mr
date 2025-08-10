#!/usr/bin/env node
// gen-mr.js
// CLI tool for creating GitLab merge requests with AI-generated name/description

import minimist from "minimist";
import readline from "readline";
import { getConfig, generatePrompt } from "./common.mjs";
import { configureChatGPTToken, showAiTokenConfigHelp } from "./ai/chatgpt.mjs";
import { setChatGPTModel, showChatGPTModelsHelp, CHATGPT_MODELS } from "./ai/chatgpt.mjs";

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
    console.log("  --help                 Show this help message");
    console.log("");
    console.log("Examples:");
    console.log("  gen-mr feature/new-ui main");
    console.log("  gen-mr feature/login develop PROJ-123,PROJ-456");
    console.log("  gen-mr --create-ai-token ChatGPT");
    console.log("  gen-mr --create-ai-token ChatGPT --global");
    console.log("  gen-mr --use-model gpt-4o");
    console.log("");
    showAiTokenConfigHelp();
    showChatGPTModelsHelp();
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
