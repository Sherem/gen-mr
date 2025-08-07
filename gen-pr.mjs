#!/usr/bin/env node
// gen-pr.js
// CLI tool for creating GitHub pull requests with AI-generated name/description

import axios from 'axios';
import minimist from 'minimist';
import readline from 'readline';
import { getConfig, generatePrompt } from './common.mjs';
const argv = minimist(process.argv.slice(2));

async function main() {
    // Check for required arguments
    const sourceBranch = argv.source;
    const targetBranch = argv.target;
    const jiraTickets = argv.jira || '';
    if (!sourceBranch || !targetBranch) {
        console.log('Usage: gen-pr --source <sourceBranch> --target <targetBranch> [--jira <JIRA-123,JIRA-456>]');
        process.exit(1);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const config = getConfig();
    const { githubToken, openaiToken, githubRepo } = config;
    const aiResult = await generatePrompt(openaiToken, sourceBranch, targetBranch, jiraTickets);
    const [title, ...descArr] = aiResult.split('\n');
    const description = descArr.join('\n');
    console.log('\nGenerated Title:', title);
    console.log('Generated Description:', description);
    rl.question('Do you want to edit the title/description? (y/N): ', async (edit) => {
        let finalTitle = title;
        let finalDescription = description;
        if (edit.toLowerCase() === 'y') {
            finalTitle = await new Promise(res => rl.question('New Title: ', res));
            finalDescription = await new Promise(res => rl.question('New Description: ', res));
        }
        // Create PR via GitHub API
        try {
            const res = await axios.post(`https://api.github.com/repos/${githubRepo}/pulls`, {
                head: sourceBranch,
                base: targetBranch,
                title: finalTitle,
                body: finalDescription
            }, {
                headers: { 'Authorization': `token ${githubToken}` }
            });
            console.log('Pull request created:', res.data.html_url);
        } catch (err) {
            console.error('Failed to create pull request:', err.response?.data || err.message);
        }
        rl.close();
    });
}

main();
