import * as core from '@actions/core'
import { config } from './config'
import { checkGithubWorkflows, logGithubWorkflows } from './github'
import { delay, poll } from './time'

async function main() {
  const { initial_delay, timeout, interval, require_success } = config()
  await delay(initial_delay)
  await poll({ timeout, interval }, logGithubWorkflows)
  
  if (require_success) {
    core.info('Checking matching workflows to ensure they succeeded..')
    await checkGithubWorkflows()
    core.info('All workflows were successful')
  }
}

main()
  .then(() => core.info('👌 Previous Github workflows completed. Resuming...'))
  .catch((e) => core.setFailed(e.message))
