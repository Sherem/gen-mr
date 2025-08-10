// ai/chatgpt.mjs
// Handles ChatGPT (OpenAI) token configuration and storage

import fs from "fs/promises";
import path from "path";
import os from "os";
import readline from "readline";

export const CHATGPT_MODELS = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
];

export const showAiTokenConfigHelp = () => {
    console.log("\n🤖 AI Token Configuration");
    console.log("".padEnd(40, "="));
    console.log("Use --create-ai-token <LLM> to set up an AI provider token:");
    console.log("");
    console.log(
        "  gen-pr --create-ai-token ChatGPT          Save token locally (./.gen-mr/config.json)"
    );
    console.log(
        "  gen-pr --create-ai-token ChatGPT --global Save token globally (~/.gen-mr/config.json)"
    );
    console.log("  gen-pr --create-ai-token ChatGPT -g       Save token globally (short form)");
    console.log("");
    console.log(
        "Supported LLM aliases (case-insensitive) for ChatGPT: ChatGPT, OpenAI, GPT, GPT-3.5, GPT-4"
    );
    console.log("");
};

export const configureChatGPTToken = async (isGlobal = false) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    console.log("\n🔗 ChatGPT (OpenAI) API Token Setup");
    console.log("".padEnd(40, "="));
    console.log("To generate a token, visit your OpenAI dashboard:");
    console.log("👉 https://platform.openai.com/api-keys");
    console.log("\n🔒 After creating the token, copy it and paste it below.");

    return new Promise((resolve, reject) => {
        rl.question("📋 Paste your OpenAI API key here: ", async (token) => {
            const trimmed = (token || "").trim();
            if (!trimmed) {
                console.log("❌ No token provided. Exiting...");
                rl.close();
                reject(new Error("No token provided"));
                return;
            }

            try {
                // Validate token with a lightweight API call
                console.log("🔍 Validating token with OpenAI...");
                const response = await fetch("https://api.openai.com/v1/models", {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${trimmed}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!response.ok) {
                    const body = await response.text();
                    throw new Error(
                        `Invalid token: ${response.status} ${response.statusText} - ${body}`
                    );
                }

                console.log("✅ Token validated!");

                // Save token to config
                await saveOpenAiTokenToConfig(trimmed, isGlobal);
                console.log(`💾 Token saved ${isGlobal ? "globally" : "locally"}!`);
                console.log("🎉 You're all set to use AI features.\n");

                rl.close();
                resolve();
            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
                rl.close();
                reject(error);
            }
        });
    });
};

const saveOpenAiTokenToConfig = async (token, isGlobal) => {
    const configDir = isGlobal
        ? path.resolve(os.homedir(), ".gen-mr")
        : path.resolve(process.cwd(), ".gen-mr");
    const configPath = path.join(configDir, "config.json");

    await fs.mkdir(configDir, { recursive: true });

    let config = {};
    try {
        const existing = await fs.readFile(configPath, "utf8");
        config = JSON.parse(existing);
    } catch {
        // ignore
    }

    config.openaiToken = token;

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`📁 Config saved to: ${configPath}`);
};

export const setChatGPTModel = async (modelName, isGlobal = false) => {
    if (!modelName || typeof modelName !== "string") {
        throw new Error("Model name is required");
    }
    const normalized = modelName.trim();
    const valid = CHATGPT_MODELS.find((m) => m.toLowerCase() === normalized.toLowerCase());
    if (!valid) {
        throw new Error(
            `Unsupported model '${modelName}'. Supported: ${CHATGPT_MODELS.join(", ")}`
        );
    }

    const configDir = isGlobal
        ? path.resolve(os.homedir(), ".gen-mr")
        : path.resolve(process.cwd(), ".gen-mr");
    const configPath = path.join(configDir, "config.json");

    await fs.mkdir(configDir, { recursive: true });

    let config = {};
    try {
        const existing = await fs.readFile(configPath, "utf8");
        config = JSON.parse(existing);
    } catch {
        // ignore
    }

    config.openaiModel = valid; // store canonical model name

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    console.log(`🤖 Model set to '${valid}' in ${isGlobal ? "global" : "local"} config.`);
    console.log(`📁 Config saved to: ${configPath}`);
};

export const showChatGPTModelsHelp = () => {
    console.log("\n🤖 ChatGPT Models");
    console.log("".padEnd(40, "="));
    console.log("Use --use-model <model> to select a model from the list below:");
    console.log("  " + CHATGPT_MODELS.join(", "));
    console.log("");
};

/**
 * Generate merge request title and description using ChatGPT
 * @param {string} openaiToken - OpenAI API token
 * @param {string} prompt - The prompt to send to ChatGPT
 * @param {string} model - The ChatGPT model to use
 * @returns {Promise<string>} Generated merge request content
 */
export const generateMergeRequestWithChatGPT = async (
    openaiToken,
    prompt,
    model = "gpt-3.5-turbo"
) => {
    if (!openaiToken) {
        throw new Error("OpenAI token is required");
    }

    if (!CHATGPT_MODELS.includes(model)) {
        throw new Error(`Unsupported model '${model}'. Supported: ${CHATGPT_MODELS.join(", ")}`);
    }

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${openaiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that generates professional merge request titles and descriptions based on git changes and context.",
                    },
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
                max_tokens: 1024,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        if (!data.choices || data.choices.length === 0) {
            throw new Error("No response generated from ChatGPT");
        }

        return data.choices[0].message.content.trim();
    } catch (error) {
        throw new Error(`Failed to generate merge request with ChatGPT: ${error.message}`);
    }
};
