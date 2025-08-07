// common.js
// Handles prompt generation, config/token management, and OpenAI API integration

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import os from 'os';

export function getConfig() {
    const localPath = path.resolve(process.cwd(), '.gen-mr/config.json');
    const homePath = path.resolve(os.homedir(), '.gen-mr/config.json');
    if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath));
    } else if (fs.existsSync(homePath)) {
        return JSON.parse(fs.readFileSync(homePath));
    } else {
        throw new Error('No config found in .gen-mr directory');
    }
}

export async function generatePrompt(openaiToken, sourceBranch, targetBranch, jiraTickets) {
    const prompt = `Generate a merge/pull request name and extensive description for merging '${sourceBranch}' into '${targetBranch}'. Include JIRA tickets: ${jiraTickets || 'none'}.`;
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512
    }, {
        headers: {
            'Authorization': `Bearer ${openaiToken}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data.choices[0].message.content;
}
