import * as core from "@actions/core";
import * as github from "@actions/github";

type WorkflowStatus =
  | "completed"
  | "action_required"
  | "cancelled"
  | "failure"
  | "neutral"
  | "skipped"
  | "stale"
  | "success"
  | "timed_out"
  | "in_progress"
  | "queued"
  | "requested"
  | "waiting"
  | undefined;

const getCurrentSHA = () => {
  const { payload, sha } = github.context;
  let currentSHA = sha;

  if (payload.pull_request) {
    currentSHA = payload.pull_request.head.sha;
  } else if (payload.workflow_run) {
    currentSHA = payload.workflow_run.head_sha;
  }

  return currentSHA;
};

const getWorkflowsWithStatus = async (statuses: Array<WorkflowStatus>) => {
  const client = github.getOctokit(
    core.getInput("access_token", { required: true }),
  );
  const results: any[] = [];
  for (const status of statuses) {
    let success = false;
    let attempts = 0;
    do {
      attempts++;
      try {
        // Await these one at a time to help avoid rate limit
        var result = await client.request(
          `GET /repos/{owner}/{repo}/actions/runs`, // See details: https://docs.github.com/en/rest/reference/actions#list-workflow-runs-for-a-repository
          { ...github.context.repo, status },
        );

        results.push(result);
        success = true;
      } catch (exception) {
        core.error(
          `Error encountered while calling github api. Attempt ${attempts} of 3. Error ${JSON.stringify(
            exception,
          )}`,
        );
      }
    } while (success === false && attempts <= 3);
  }

  const includedWorkflows = core.getMultilineInput("workflows", {
    required: false,
  });

  const excludedWorkflows = core.getMultilineInput("excludedWorkflows", {
    required: false,
  });

  const currentSHA = getCurrentSHA();

  const runs = results.flatMap((response) => response.data.workflow_runs);

  const isNil = (value: any) => value === null || value === undefined;

  if (runs.some((run) => isNil(run.name))) {
    throw Error(
      `Workflow name not found for run ${JSON.stringify(
        runs.filter((run) => run.name === null || run.name === undefined),
      )}`,
    );
  }

  return runs
    .filter((run) =>
      includedWorkflows.length > 0
        ? includedWorkflows.includes(run.name)
        : true,
    )
    .filter((run) =>
      excludedWorkflows.length > 0
        ? !excludedWorkflows.includes(run.name)
        : true,
    )
    .filter(
      (run) =>
        run.id !== Number(process.env.GITHUB_RUN_ID) &&
        run.head_sha === currentSHA,
    ); // only keep workflows running from the same SHA/branch);
};

const filterGithubWorkflows = async () => {
  const workflows = await getWorkflowsWithStatus(["queued", "in_progress"]);

  return workflows.filter((run) => run.status !== "completed");
};

type GithubWorkflow = { name: string; status: WorkflowStatus };

const logGithubWorkflows = (retries: number, workflows: GithubWorkflow[]) => {
  core.info(
    `Retry #${retries} - ${workflows.length} ${
      workflows.length > 1 ? "workflows" : "workflow"
    } in progress found. Please, wait until completion or consider cancelling these workflows manually:`,
  );
  workflows.map((workflow: GithubWorkflow) => {
    core.info(`* ${workflow.name}: ${workflow.status}`);
  });
  core.info("");
};

const checkGithubWorkflows = async () => {
  const failedWorkflows = await getWorkflowsWithStatus([
    "cancelled",
    "timed_out",
    "failure",
  ]);

  if (failedWorkflows.length === 0) {
    return;
  }

  failedWorkflows.forEach((run) => {
    core.error(
      `Workflow ${run.name}, run id: ${run.id} (${run.created_at}) failed with conclusion: ${run.conclusion} and status of ${run.status}, See: ${run.html_url}`,
    );
  });

  throw Error("One or more failed workflows exist for commit, failing step.");
};

export {
  checkGithubWorkflows,
  filterGithubWorkflows,
  logGithubWorkflows,
  GithubWorkflow,
};
