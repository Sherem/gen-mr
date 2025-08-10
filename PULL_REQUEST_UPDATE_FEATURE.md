# Pull Request Update Functionality

## New Features Added

### 1. Existing PR Detection

- Before creating a new pull request, the tool now checks if one already exists for the same source and target branches
- Uses GitHub API to query open pull requests with matching head and base branches

### 2. Update Existing PR Option

- If an existing PR is found, the tool displays:
    - Current PR title
    - PR URL
    - PR status
- Asks user if they want to update the existing PR with new AI-generated content

### 3. Smart PR Management

- If user chooses to update: generates new title/description and updates the existing PR
- If user chooses not to update: cancels operation and leaves existing PR unchanged
- If no existing PR found: creates a new PR as before

## User Flow

1. **Run command**: `./src/gen-pr.mjs source-branch target-branch`

2. **Repository detection**: Tool detects GitHub repository from git remote

3. **Existing PR check**:

    ```
    🔍 Checking for existing pull requests...
    ```

4. **If PR exists**:

    ```
    📋 Found existing pull request:
       Title: [Current PR Title]
       URL: https://github.com/owner/repo/pull/123
       Status: open

    Do you want to update the existing PR with new AI-generated content? (y/N):
    ```

5. **AI Generation**: Generates new title and description using ChatGPT

6. **Final action**:
    - **Update existing**: `✅ Pull request updated: [URL]`
    - **Create new**: `✅ Pull request created: [URL]`

## API Functions Added

### In `gen-pr.mjs`:

- `getFromGithub()` - GET requests to GitHub API
- `patchToGithub()` - PATCH requests to GitHub API
- `findExistingPullRequest()` - Check for existing PRs

### In `git-utils.mjs`:

- `branchesHaveDifferences()` - Check if branches have commits to merge

## Benefits

1. **Prevents duplicate PRs** - No more accidentally creating multiple PRs for same branches
2. **Easy PR updates** - Quickly refresh PR title/description with latest changes
3. **Iterative development** - Perfect for feature branches that get updated multiple times
4. **Smart workflow** - Handles both new and existing PR scenarios seamlessly
