// github-provider.mjs
// GitHub repository provider implementation (previously github-utils.mjs)

/**
 * Create GitHub provider bound to provided configuration.
 * @param {object} cfg
 * @param {string} cfg.githubToken - GitHub token for authentication
 * @returns {{
 *   postToRemoteRepo: (url: string, data: object) => Promise<object>,
 *   getFromRemoteRepo: (url: string) => Promise<object>,
 *   patchAtRemoteRepo: (url: string, data: object) => Promise<object>,
 *   findExistingPullRequest: (repository: string, sourceBranch: string, targetBranch: string) => Promise<object|null>,
 *   createOrUpdatePullRequest: (opts: { repository: string, sourceBranch: string, targetBranch: string, title: string, description: string, existingRequest?: object|null }) => Promise<object>
 * }}
 */
export const createGithubProvider = ({ githubToken }) => {
    if (!githubToken) {
        throw new Error("Missing required githubToken for GitHub utils");
    }

    const commonHeaders = {
        "Content-Type": "application/json",
        Authorization: `token ${githubToken}`,
    };

    const postToRemoteRepo = async (url, data) => {
        const response = await fetch(url, {
            method: "POST",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const getFromRemoteRepo = async (url) => {
        const response = await fetch(url, {
            method: "GET",
            headers: commonHeaders,
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const patchAtRemoteRepo = async (url, data) => {
        const response = await fetch(url, {
            method: "PATCH",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const findExistingPullRequest = async (repository, sourceBranch, targetBranch) => {
        try {
            const pulls = await getFromRemoteRepo(
                `https://api.github.com/repos/${repository}/pulls?state=open&head=${sourceBranch}&base=${targetBranch}`
            );
            return pulls.length > 0 ? pulls[0] : null;
        } catch (error) {
            console.warn("Warning: Could not check for existing pull requests:", error.message);
            return null;
        }
    };

    const createOrUpdatePullRequest = async ({
        repository,
        sourceBranch,
        targetBranch,
        title,
        description,
        existingRequest,
    }) => {
        try {
            if (existingRequest) {
                const res = await patchAtRemoteRepo(
                    `https://api.github.com/repos/${repository}/pulls/${existingRequest.number}`,
                    {
                        title,
                        body: description,
                    }
                );
                console.log("✅ Pull request updated:", res.html_url);
                return res;
            } else {
                const res = await postToRemoteRepo(
                    `https://api.github.com/repos/${repository}/pulls`,
                    {
                        head: sourceBranch,
                        base: targetBranch,
                        title,
                        body: description,
                    }
                );
                console.log("✅ Pull request created:", res.html_url);
                return res;
            }
        } catch (err) {
            const actionText = existingRequest ? "update" : "create";
            console.error(`❌ Failed to ${actionText} pull request:`, err.message);
            throw err;
        }
    };

    return {
        postToRemoteRepo,
        getFromRemoteRepo,
        patchAtRemoteRepo,
        findExistingPullRequest,
        createOrUpdatePullRequest,
    };
};
