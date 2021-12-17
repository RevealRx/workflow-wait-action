import * as core from '@actions/core'
import { config } from './config'
import { checkGithubWorkflows, logGithubWorkflows } from './github'
import { delay, poll } from './time'

async function main() {
  const { initial_delay, timeout, interval, require_success } = config()
  await delay(initial_delay)
  await poll({ timeout, interval }, logGithubWorkflows)
  
  if (require_success) {
    await checkGithubWorkflows()
  }
}

main()
  .then(() => core.info('👌 Previous Github workflows completed. Resuming...'))
  .catch((e) => core.setFailed(e.message))
