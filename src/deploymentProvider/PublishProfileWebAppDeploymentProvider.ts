import {IWebAppDeploymentProvider} from './IWebAppDeploymentProvider'
import {TaskParameters} from '../operations/TaskParameters'
import {
  PublishProfileUtility,
  PublishingProfile
} from '../operations/PublishProfileUtility'
// import { FileTransformsUtility } from '../operations/FileTransformsUtility';
// import { AzureAppServiceUtility } from '../operations/AzureAppServiceUtility';
import * as tl from '../task-lib/task'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as core from '@actions/core'
import * as packageUtility from '../webdeployment-common-v2/packageUtility'
// import * as deployUtility from '../webdeployment-common-v2/utility'

// var msDeployUtility = require('webdeployment-common-v2/msdeployutility.js');

const DEFAULT_RETRY_COUNT = 3

export class PublishProfileWebAppDeploymentProvider
  implements IWebAppDeploymentProvider {
  private taskParams: TaskParameters
  private publishProfileUtility?: PublishProfileUtility
  private origWebPackage?: string
  private modWebPackage?: string
  private bakWebPackage?: string
  private origEnvPath?: string

  constructor(taskParams: TaskParameters) {
    this.taskParams = taskParams
  }

  async PreDeploymentStep(): Promise<void> {
    if (this.taskParams.PublishProfilePath) {
      this.publishProfileUtility = new PublishProfileUtility(
        this.taskParams.PublishProfilePath
      )
      try {
        const siteUrl = await this.publishProfileUtility.GetPropertyValuefromPublishProfile(
          'SiteUrlToLaunchAfterPublish'
        )
        core.debug(`DELETE THIS LINE - ${siteUrl}`)
        // await AzureAppServiceUtility.pingApplication(siteUrl);
        // tl.setVariable('AppServiceApplicationUrl', siteUrl);
      } catch (error) {
        core.debug(`Unable to ping webapp, Error: ${error}`)
      }
    } else {
      core.error('No Publish Profile Path set')
    }
  }

  async DeployWebAppStep(): Promise<void> {
    if (!os.type().match(/^Win/)) {
      throw Error(
        'Publish using webdeploy options are supported only when using Windows agent'
      )
    }

    core.debug('Performing the deployment of webapp using publish profile.')

    const applyFileTransformFlag =
      this.taskParams.JSONFiles ||
      this.taskParams.XmlTransformation ||
      this.taskParams.XmlVariableSubstitution
    if (applyFileTransformFlag) {
      await this.ApplyFileTransformation()
    }

    if (this.publishProfileUtility) {
      const msDeployPublishingProfile: PublishingProfile = await this.publishProfileUtility.GetTaskParametersFromPublishProfileFile(
        this.taskParams
      )
      const deployCmdFilePath = this.GetDeployCmdFilePath()

      await this.SetMsdeployEnvPath()
      const cmdArgs: string = this.GetDeployScriptCmdArgs(
        msDeployPublishingProfile
      )

      const retryCountParam = tl.getVariable('appservice.msdeployretrycount')
      let retryCount =
        retryCountParam && !isNaN(Number(retryCountParam))
          ? Number(retryCountParam)
          : DEFAULT_RETRY_COUNT

      try {
        for (;;) {
          try {
            retryCount -= 1
            await this.publishProfileUtility.RunCmd(deployCmdFilePath, cmdArgs)
            break
          } catch (error) {
            if (retryCount === 0) {
              throw error
            }
            core.info(error)
            core.info('Retrying to deploy the package.')
          }
        }
        core.info('Successfully deployed web package to App Service.')
      } catch (error) {
        core.error('Failed to deploy web package to App Service.')
        core.debug(JSON.stringify(error))
        // msDeployUtility.redirectMSDeployErrorToConsole();
        throw Error(error.message)
      } finally {
        this.ResetMsdeployEnvPath()
        if (applyFileTransformFlag) {
          this.ResetFileTransformation()
        }
      }
    } else {
      core.error('Publish Profile Utility not set')
    }
  }

  async UpdateDeploymentStatus(isDeploymentSuccess: boolean): Promise<void> {
    core.info(
      `Update Deployment Status called but not implemented in this Provider [${isDeploymentSuccess}]`
    )
  }

  private async SetMsdeployEnvPath(): Promise<void> {
    // var msDeployPath = await msDeployUtility.getMSDeployFullPath();
    // var msDeployDirectory = msDeployPath.slice(0, msDeployPath.lastIndexOf('\\') + 1);
    // this.origEnvPath = process.env.PATH;
    // process.env.PATH = msDeployDirectory + ";" + process.env.PATH ;
  }

  private ResetMsdeployEnvPath(): void {
    process.env.PATH = this.origEnvPath
  }

  private GetDeployCmdFilePath(): string {
    if (this.taskParams.Package) {
      const webPackagePath = this.taskParams.Package.getPath()
      const packageDir = path.dirname(webPackagePath)
      return packageUtility.PackageUtility.getPackagePath(
        `${packageDir}\\*.deploy.cmd`
      )
    }

    throw new Error('Package not set')
  }

  private GetDeployScriptCmdArgs(
    msDeployPublishingProfile: PublishingProfile
  ): string {
    let deployCmdArgs = ` /Y /A:basic "/U:${msDeployPublishingProfile.UserName}" "\\"/P:${msDeployPublishingProfile.UserPWD}\\"" "\\"/M:https://${msDeployPublishingProfile.PublishUrl}/msdeploy.axd?site=${msDeployPublishingProfile.WebAppName}\\""`

    if (msDeployPublishingProfile.TakeAppOfflineFlag) {
      deployCmdArgs += ' -enableRule:AppOffline'
    }

    if (msDeployPublishingProfile.RemoveAdditionalFilesFlag) {
      deployCmdArgs += ' -enableRule:DoNotDeleteRule'
    }

    if (this.taskParams.AdditionalArguments) {
      deployCmdArgs += ` ${this.taskParams.AdditionalArguments}`
    }

    return deployCmdArgs
  }

  private async ApplyFileTransformation(): Promise<void> {
    // this.origWebPackage = packageUtility.PackageUtility.getPackagePath(this.taskParams.Package.getPath());
    // this.modWebPackage = await FileTransformsUtility.applyTransformations(this.origWebPackage, this.taskParams);
    // this.bakWebPackage = this.origWebPackage + ".bak";
    // fs.renameSync(this.origWebPackage, this.bakWebPackage);
    // fs.renameSync(this.modWebPackage, this.origWebPackage);
  }

  private ResetFileTransformation(): void {
    if (this.origWebPackage && this.bakWebPackage) {
      tl.rmRF(this.origWebPackage)
      fs.renameSync(this.bakWebPackage, this.origWebPackage)
    }
  }
}
