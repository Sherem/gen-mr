// gitlab-provider.mjs
// GitLab repository provider implementation

/**
 * Create GitLab provider bound to provided configuration.
 * @param {object} cfg
 * @param {string} cfg.gitlabToken - GitLab token for authentication
 * @param {string} cfg.gitlabHost - GitLab host (default: gitlab.com)
 * @returns {{
 *   postToRemoteRepo: (url: string, data: object) => Promise<object>,
 *   getFromRemoteRepo: (url: string) => Promise<object>,
 *   patchAtRemoteRepo: (url: string, data: object) => Promise<object>,
 *   findExistingMergeRequest: (repository: string, sourceBranch: string, targetBranch: string) => Promise<object|null>,
 *   createOrUpdateMergeRequest: (opts: { repository: string, sourceBranch: string, targetBranch: string, title: string, description: string, existingRequest?: object|null }) => Promise<object>
 * }}
 */
export const createGitlabProvider = ({ gitlabToken, gitlabHost = "gitlab.com" }) => {
    if (!gitlabToken) {
        throw new Error("Missing required gitlabToken for GitLab utils");
    }

    const commonHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${gitlabToken}`,
    };

    const baseUrl = `https://${gitlabHost}/api/v4`;

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
            method: "PUT",
            headers: commonHeaders,
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.text();
            throw new Error(err);
        }
        return response.json();
    };

    const findExistingMergeRequest = async (repository, sourceBranch, targetBranch) => {
        try {
            // Encode the repository path for URL
            const encodedRepo = encodeURIComponent(repository);
            const mergeRequests = await getFromRemoteRepo(
                `${baseUrl}/projects/${encodedRepo}/merge_requests?state=opened&source_branch=${sourceBranch}&target_branch=${targetBranch}`
            );
            if (mergeRequests.length > 0) {
                const mr = mergeRequests[0];
                // Map GitLab fields to workflow-expected format
                return {
                    ...mr,
                    // Add compatibility fields for workflow display
                    html_url: mr.web_url, // workflow expects html_url
                    body: mr.description, // workflow expects body field for description
                };
            }
            return null;
        } catch (error) {
            console.warn("Warning: Could not check for existing merge requests:", error.message);
            return null;
        }
    };

    const createOrUpdateMergeRequest = async ({
        repository,
        sourceBranch,
        targetBranch,
        title,
        description,
        existingRequest,
    }) => {
        try {
            const encodedRepo = encodeURIComponent(repository);

            if (existingRequest) {
                const res = await patchAtRemoteRepo(
                    `${baseUrl}/projects/${encodedRepo}/merge_requests/${existingRequest.iid}`,
                    {
                        title,
                        description,
                    }
                );
                console.log("✅ Merge request updated:", res.web_url);
                return res;
            } else {
                const res = await postToRemoteRepo(
                    `${baseUrl}/projects/${encodedRepo}/merge_requests`,
                    {
                        source_branch: sourceBranch,
                        target_branch: targetBranch,
                        title,
                        description,
                    }
                );
                console.log("✅ Merge request created:", res.web_url);
                return res;
            }
        } catch (err) {
            const actionText = existingRequest ? "update" : "create";
            console.error(`❌ Failed to ${actionText} merge request:`, err.message);
            throw err;
        }
    };

    return {
        postToRemoteRepo,
        getFromRemoteRepo,
        patchAtRemoteRepo,
        findExistingMergeRequest,
        createOrUpdateMergeRequest,
        // Aliases for compatibility with workflow.mjs (which uses GitHub terminology)
        findExistingPullRequest: findExistingMergeRequest,
        createOrUpdatePullRequest: createOrUpdateMergeRequest,
    };
};
