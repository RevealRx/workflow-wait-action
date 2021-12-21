import * as core from '@actions/core'
import * as github from '@actions/github'

type WorkflowStatus =
  | 'queued'
  | 'completed'
  | 'in_progress'
  | 'action_required'
  | 'cancelled'
  | 'failure'
  | 'neutral'
  | 'success'
  | 'skipped'
  | 'stale'
  | 'timed_out'
  | 'requested'
  | 'waiting'
  | undefined

const getCurrentSHA = () => {
  const { payload, sha } = github.context
  let currentSHA = sha
   
  if (payload.pull_request) {
    currentSHA = payload.pull_request.head.sha
  } else if (payload.workflow_run) {
    currentSHA = payload.workflow_run.head_sha
  }
  
  return currentSHA;
}
  
const getWorkflowsWithStatus = async (statuses: string[]) => {
  const client = github.getOctokit(
    core.getInput('access_token', { required: true })
  );

  const results = await Promise.all(
    statuses
      .map((status) => <WorkflowStatus>status)
      .map((status) =>
        client.request(
          `GET /repos/{owner}/{repo}/actions/runs`, // See details: https://docs.github.com/en/rest/reference/actions#list-workflow-runs-for-a-repository
          { ...github.context.repo, status }
        )
      ) 
  );
  
  const includedWorkflows = core.getMultilineInput('workflows', {
    required: false,
  })

  const excludedWorkflows = core.getMultilineInput('excludedWorkflows', {
    required: false,
  });
  
  const currentSHA = getCurrentSHA()

  const runs = results
    .flatMap((response) => response.data.workflow_runs);

  const isNil = (value: any) => value === null || value.name === undefined;
  
  core.info(`Runs found with null names: ${runs.some((run) => isNil(run.name))}`);
  core.info(`Run names: ${JSON.stringify(runs.map(x => x.name))}`);

  if (runs.some((run) => isNil(run.name))) {
    throw Error(`Workflow name not found for run ${JSON.stringify(runs.filter((run) => run.name === null || run.name === undefined))}`);
  }

  return runs
    .filter((run) => (includedWorkflows.length > 0 ? includedWorkflows.includes(run.name) : true))
    .filter((run) => (excludedWorkflows.length > 0 ? !excludedWorkflows.includes(run.name) : true))
    .filter((run) => run.id !== Number(process.env.GITHUB_RUN_ID) && run.head_sha === currentSHA); // only keep workflows running from the same SHA/branch);
}

const filterGithubWorkflows = async () => {
  const workflows = await getWorkflowsWithStatus(['queued', 'in_progress']);

  return workflows
    .filter((run) => run.status !== 'completed');
}

type GithubWorkflow = { name: string; status: string }

const logGithubWorkflows = (retries: number, workflows: GithubWorkflow[]) => {
  core.info(
    `Retry #${retries} - ${workflows.length} ${
      workflows.length > 1 ? 'workflows' : 'workflow'
    } in progress found. Please, wait until completion or consider cancelling these workflows manually:`
  )
  workflows.map((workflow: GithubWorkflow) => {
    core.info(`* ${workflow.name}: ${workflow.status}`)
  })
  core.info('')
}

const checkGithubWorkflows = async () => {
  const failedWorkflows = await getWorkflowsWithStatus(['cancelled', 'timed_out', 'failure']);
  
  failedWorkflows.forEach((run) => {
    core.error(`Workflow ${run.name}, run id: ${run.id} (${run.created_at}) failed with conclusion: ${run.conclusion} and status of ${run.status}, See: ${run.html_url}`)
  })
  
  throw Error('One or more failed workflows exist for commit, failing step.')
}

export { checkGithubWorkflows, filterGithubWorkflows, logGithubWorkflows, GithubWorkflow }
