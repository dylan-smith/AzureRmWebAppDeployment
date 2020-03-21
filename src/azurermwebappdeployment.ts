//import tl = require('azure-pipelines-task-lib/task');
//import path = require('path')
import {
  TaskParameters,
  TaskParametersUtility
} from './operations/TaskParameters'
import {DeploymentFactory} from './deploymentProvider/DeploymentFactory'
//import * as Endpoint from 'azure-arm-rest-v2/azure-arm-endpoint';

import * as core from '@actions/core'

async function run(): Promise<void> {
  //let isDeploymentSuccess = true

  try {
    core.debug('inside my task debug')
    core.info('inside my task info')
    //tl.setResourcePath(path.join( __dirname, 'task.json'));
    //tl.setResourcePath(path.join( __dirname, 'node_modules/azure-arm-rest-v2/module.json'));
    //tl.setResourcePath(path.join( __dirname, 'node_modules/webdeployment-common-v2/module.json'));
    const taskParams: TaskParameters = TaskParametersUtility.getParameters()
    const deploymentFactory: DeploymentFactory = new DeploymentFactory(
      taskParams
    )
    //var deploymentProvider = await deploymentFactory.GetDeploymentProvider();

    core.info(`got past ${taskParams.ConnectionType}`)
    core.info(`got past ${typeof deploymentFactory}`)

    //tl.debug("Predeployment Step Started");
    //await deploymentProvider.PreDeploymentStep();

    //tl.debug("Deployment Step Started");
    //await deploymentProvider.DeployWebAppStep();
  } catch (error) {
    //tl.debug("Deployment Failed with Error: " + error);
    //isDeploymentSuccess = false;
    //tl.setResult(tl.TaskResult.Failed, error);
    core.setFailed(error.message)
  } finally {
    //if(deploymentProvider != null) {
    //    await deploymentProvider.UpdateDeploymentStatus(isDeploymentSuccess);
    //}
    //Endpoint.dispose();
    //tl.debug(isDeploymentSuccess ? "Deployment Succeded" : "Deployment failed");
  }
}

run()
