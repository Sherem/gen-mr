# gen-mr

AI-powered CLI tools to generate and create GitLab merge requests and GitHub pull requests with automatically generated titles and descriptions.

## Features

- 🤖 **AI-Generated Content**: Uses OpenAI GPT-3.5-turbo to generate meaningful merge request/pull request titles and descriptions
- 🔧 **GitLab Integration**: Create merge requests directly via GitLab API
- 🐙 **GitHub Integration**: Create pull requests directly via GitHub API
- 🎫 **JIRA Integration**: Include JIRA ticket references in generated content
- ⚙️ **Flexible Configuration**: Support for both local and global configuration
- 📝 **Interactive Editing**: Option to edit AI-generated content before submission

## Installation

### From Source

1. Clone the repository:
```bash
git clone <repository-url>
cd gen-mr
```

2. Install dependencies:
```bash
npm install
```

3. Make the scripts executable (if needed):
```bash
chmod +x src/gen-mr.mjs src/gen-pr.mjs
```

### Using npm link (for development)

```bash
npm link
```

This will make `gen-mr` and `gen-pr` commands available globally.

## Configuration

Both tools require configuration files with API tokens and project settings. Configuration files are searched in this order:

1. `.gen-mr/config.json` in the current working directory
2. `.gen-mr/config.json` in your home directory

### Configuration Format

Create a `.gen-mr/config.json` file with the following structure:

```json
{
  "openaiToken": "your-openai-api-key",
  "gitlabToken": "your-gitlab-personal-access-token",
  "gitlabUrl": "https://gitlab.com",
  "gitlabProjectId": "your-project-id",
  "githubToken": "your-github-personal-access-token",
  "githubOwner": "your-github-username-or-org",
  "githubRepo": "your-repository-name"
}
```

### Required Tokens

- **OpenAI API Key**: Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **GitLab Personal Access Token**: Create from GitLab → User Settings → Access Tokens (requires `api` scope)
- **GitHub Personal Access Token**: Create from GitHub → Settings → Developer settings → Personal access tokens (requires `repo` scope)

## Usage

### GitLab Merge Requests

```bash
# Basic usage
gen-mr <sourceBranch> <targetBranch>

# With JIRA tickets
gen-mr feature/new-feature main PROJ-123,PROJ-456

# Show help
gen-mr --help
```

#### Examples

```bash
# Create MR from feature branch to main
gen-mr feature/user-authentication main

# Create MR with JIRA ticket references
gen-mr feature/payment-gateway develop PAYMENT-101,PAYMENT-102

# Create MR from hotfix to release branch
gen-mr hotfix/critical-bug release/v2.1
```

### GitHub Pull Requests

```bash
# Basic usage
gen-pr <sourceBranch> <targetBranch>

# With JIRA tickets
gen-pr feature/new-feature main PROJ-123,PROJ-456

# Configure GitHub token
gen-pr --create-token

# Configure GitHub token globally
gen-pr --create-token --global

# Show help
gen-pr --help
```

#### Examples

```bash
# Create PR from feature branch to main
gen-pr feature/user-dashboard main

# Create PR with JIRA ticket references
gen-pr bugfix/login-issue develop BUG-456

# Configure tokens interactively
gen-pr --create-token
```

## How It Works

1. **Branch Analysis**: The tool analyzes the source and target branches
2. **AI Generation**: Sends a prompt to OpenAI GPT-3.5-turbo including branch names and JIRA tickets
3. **Content Generation**: AI generates a meaningful title and detailed description
4. **Interactive Review**: Displays generated content and allows editing
5. **API Submission**: Creates the merge request/pull request via GitLab/GitHub API

## Development

### Scripts

```bash
# Run GitLab MR generator
npm run start:mr

# Run GitHub PR generator  
npm run start:pr

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
gen-mr/
├── src/
│   ├── common.mjs          # Shared utilities and OpenAI integration
│   ├── gen-mr.mjs          # GitLab merge request CLI
│   ├── gen-pr.mjs          # GitHub pull request CLI
│   └── token-config.mjs    # Token configuration utilities
├── package.json
├── eslint.config.mjs
└── README.md
```

## Troubleshooting

### Common Issues

1. **"No config found in .gen-mr directory"**
   - Create a `.gen-mr/config.json` file with your API tokens
   - Ensure the file is in either your current directory or home directory

2. **"Failed to create merge request/pull request"**
   - Verify your GitLab/GitHub tokens have the correct permissions
   - Check that the project ID (GitLab) or owner/repo (GitHub) are correct
   - Ensure source and target branches exist

3. **OpenAI API errors**
   - Verify your OpenAI API key is valid and has sufficient credits
   - Check your OpenAI account usage limits

### Debug Tips

- Use absolute branch names if you encounter branch resolution issues
- Verify your GitLab project ID by checking the project URL or API
- For GitHub, ensure the repository owner and name are correct

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and formatting: `npm run lint && npm run format`
5. Submit a pull request

## License

MIT License - see the LICENSE file for details.
