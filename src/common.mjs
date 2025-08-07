// common.js
// Handles prompt generation, config/token management, and OpenAI API integration

import fs from "fs/promises";
import path from "path";
import os from "os";

export const getConfig = async () => {
    const localPath = path.resolve(process.cwd(), ".gen-mr/config.json");
    const homePath = path.resolve(os.homedir(), ".gen-mr/config.json");
    try {
        await fs.access(localPath);
        const data = await fs.readFile(localPath, "utf8");
        return JSON.parse(data);
    } catch {
        try {
            await fs.access(homePath);
            const data = await fs.readFile(homePath, "utf8");
            return JSON.parse(data);
        } catch {
            throw new Error("No config found in .gen-mr directory");
        }
    }
};

export const generatePrompt = async (openaiToken, sourceBranch, targetBranch, jiraTickets) => {
    const prompt = `Generate a merge/pull request name and extensive description for merging '${sourceBranch}' into '${targetBranch}'. Include JIRA tickets: ${jiraTickets || "none"}.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${openaiToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 512,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
    }
    const data = await response.json();
    return data.choices[0].message.content;
};
