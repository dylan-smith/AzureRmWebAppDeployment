import * as core from '@actions/core'
import * as Constant from './Constants'
import {Package, PackageType} from '../webdeployment-common-v2/packageUtility'
import * as util from 'util'
import * as tl from '../task-lib/task'
import * as webCommonUtility from '../webdeployment-common-v2/utility'

export enum DeploymentType {
  webDeploy,
  zipDeploy,
  runFromZip,
  warDeploy
}

export const TaskParametersUtility = {
  getParameters(): TaskParameters {
    const taskParameters: TaskParameters = {
      ConnectionType: core.getInput('ConnectionType', {required: true}),
      WebAppKind: core.getInput('WebAppKind'),
      DeployToSlotOrASEFlag: tl.getBoolInput('DeployToSlotOrASEFlag'),
      GenerateWebConfig: tl.getBoolInput('GenerateWebConfig'),
      WebConfigParameters: core.getInput('WebConfigParameters'),
      XmlTransformation: tl.getBoolInput('XmlTransformation'),
      JSONFiles: tl.getDelimitedInput('JSONFiles', '\n'),
      XmlVariableSubstitution: tl.getBoolInput('XmlVariableSubstitution'),
      TakeAppOfflineFlag: tl.getBoolInput('TakeAppOfflineFlag'),
      RenameFilesFlag: tl.getBoolInput('RenameFilesFlag'),
      AdditionalArguments: core.getInput('AdditionalArguments'),
      ScriptType: core.getInput('ScriptType'),
      InlineScript: core.getInput('InlineScript'),
      ScriptPath: tl.getPathInput('ScriptPath'),
      DockerNamespace: core.getInput('DockerNamespace'),
      AppSettings: core.getInput('AppSettings'),
      StartupCommand: core.getInput('StartupCommand'),
      ConfigurationSettings: core.getInput('ConfigurationSettings')
    }

    if (
      taskParameters.ConnectionType === Constant.ConnectionType.PublishProfile
    ) {
      this._initializeDefaultParametersForPublishProfile(taskParameters)
      return taskParameters
    }

    taskParameters.connectedServiceName = core.getInput(
      'ConnectedServiceName',
      {required: true}
    )
    taskParameters.WebAppName = core.getInput('WebAppName', {required: true})
    taskParameters.isFunctionApp =
      taskParameters.WebAppKind?.indexOf('function') !== -1
    taskParameters.isLinuxApp =
      taskParameters.WebAppKind?.indexOf('Linux') !== -1 ||
      taskParameters.WebAppKind?.indexOf('Container') !== -1
    taskParameters.isBuiltinLinuxWebApp =
      taskParameters.WebAppKind?.indexOf('Linux') !== -1
    taskParameters.isContainerWebApp =
      taskParameters.WebAppKind?.indexOf('Container') !== -1
    taskParameters.ResourceGroupName = taskParameters.DeployToSlotOrASEFlag
      ? core.getInput('ResourceGroupName')
      : undefined
    taskParameters.SlotName = taskParameters.DeployToSlotOrASEFlag
      ? core.getInput('SlotName')
      : undefined

    if (!taskParameters.isContainerWebApp) {
      taskParameters.Package = new Package(
        tl.getPathInput('Package', {required: true})
      )
      core.debug(
        `intially web config parameters :${taskParameters.WebConfigParameters}`
      )
      if (
        taskParameters.Package.getPackageType() === PackageType.jar &&
        !taskParameters.isLinuxApp
      ) {
        if (!taskParameters.WebConfigParameters) {
          taskParameters.WebConfigParameters = '-appType java_springboot'
        }
        if (
          !taskParameters.WebConfigParameters.includes(
            '-appType java_springboot'
          )
        ) {
          taskParameters.WebConfigParameters += ' -appType java_springboot'
        }
        if (
          taskParameters.WebConfigParameters.includes(
            '-JAR_PATH D:\\home\\site\\wwwroot\\*.jar'
          )
        ) {
          const jarPath = webCommonUtility.getFileNameFromPath(
            taskParameters.Package.getPath()
          )
          taskParameters.WebConfigParameters = taskParameters.WebConfigParameters.replace(
            'D:\\home\\site\\wwwroot\\*.jar',
            jarPath
          )
        } else if (!taskParameters.WebConfigParameters.includes('-JAR_PATH ')) {
          const jarPath = webCommonUtility.getFileNameFromPath(
            taskParameters.Package.getPath()
          )
          taskParameters.WebConfigParameters += ` -JAR_PATH ${jarPath}`
        }
        if (
          taskParameters.WebConfigParameters.includes(
            '-Dserver.port=%HTTP_PLATFORM_PORT%'
          )
        ) {
          taskParameters.WebConfigParameters = taskParameters.WebConfigParameters.replace(
            '-Dserver.port=%HTTP_PLATFORM_PORT%',
            ''
          )
        }
        core.debug(
          `web config parameters :${taskParameters.WebConfigParameters}`
        )
      }
    }

    taskParameters.UseWebDeploy = !taskParameters.isLinuxApp
      ? tl.getBoolInput('UseWebDeploy')
      : false

    if (taskParameters.isLinuxApp && taskParameters.isBuiltinLinuxWebApp) {
      if (taskParameters.isFunctionApp) {
        taskParameters.RuntimeStack = core.getInput('RuntimeStackFunction')
      } else {
        taskParameters.RuntimeStack = core.getInput('RuntimeStack')
      }
      taskParameters.TakeAppOfflineFlag = false
    }

    if (!taskParameters.isFunctionApp && !taskParameters.isLinuxApp) {
      taskParameters.VirtualApplication = core.getInput('VirtualApplication')
      taskParameters.VirtualApplication =
        taskParameters.VirtualApplication &&
        taskParameters.VirtualApplication.startsWith('/')
          ? taskParameters.VirtualApplication.substr(1)
          : taskParameters.VirtualApplication
    }

    if (taskParameters.UseWebDeploy) {
      taskParameters.DeploymentType = this.getDeploymentType(
        core.getInput('DeploymentType')
      )
      if (taskParameters.DeploymentType === DeploymentType.webDeploy) {
        taskParameters.RemoveAdditionalFilesFlag = tl.getBoolInput(
          'RemoveAdditionalFilesFlag'
        )
        taskParameters.SetParametersFile = tl.getPathInput('SetParametersFile')
        taskParameters.ExcludeFilesFromAppDataFlag = tl.getBoolInput(
          'ExcludeFilesFromAppDataFlag'
        )
        taskParameters.AdditionalArguments =
          core.getInput('AdditionalArguments') || ''
      }
    } else {
      // Retry Attempt is passed by default
      taskParameters.AdditionalArguments =
        '-retryAttempts:6 -retryInterval:10000'
    }

    if (taskParameters.isLinuxApp && taskParameters.ScriptType) {
      this.UpdateLinuxAppTypeScriptParameters(taskParameters)
    }

    return taskParameters
  },

  _initializeDefaultParametersForPublishProfile(
    taskParameters: TaskParameters
  ): void {
    taskParameters.PublishProfilePath = core.getInput('PublishProfilePath', {
      required: true
    })
    taskParameters.PublishProfilePassword = core.getInput(
      'PublishProfilePassword',
      {required: true}
    )
    taskParameters.Package = new Package(
      tl.getPathInput('Package', {required: true})
    )
    taskParameters.AdditionalArguments = '-retryAttempts:6 -retryInterval:10000'
  },

  UpdateLinuxAppTypeScriptParameters(taskParameters: TaskParameters) {
    const retryTimeoutValue = tl.getVariable('appservicedeploy.retrytimeout')
    const timeoutAppSettings = retryTimeoutValue
      ? Number(retryTimeoutValue) * 60
      : 1800

    core.debug(
      `setting app setting SCM_COMMAND_IDLE_TIMEOUT to ${timeoutAppSettings}`
    )
    if (taskParameters.AppSettings) {
      taskParameters.AppSettings = `-SCM_COMMAND_IDLE_TIMEOUT ${timeoutAppSettings} ${taskParameters.AppSettings}`
    } else {
      taskParameters.AppSettings = `-SCM_COMMAND_IDLE_TIMEOUT ${timeoutAppSettings}`
    }
  },

  getDeploymentType(type: string): DeploymentType {
    switch (type) {
      case 'webDeploy':
        return DeploymentType.webDeploy
      case 'zipDeploy':
        return DeploymentType.zipDeploy
      case 'runFromZip':
        return DeploymentType.runFromZip
      case 'warDeploy':
        return DeploymentType.warDeploy
    }

    throw new Error(util.format('Unexpected deployment type %s', type))
  }
}

export interface TaskParameters {
  ConnectionType: string
  connectedServiceName?: string
  PublishProfilePath?: string
  PublishProfilePassword?: string
  WebAppName?: string
  WebAppKind?: string
  DeployToSlotOrASEFlag?: boolean
  ResourceGroupName?: string
  SlotName?: string
  VirtualApplication?: string
  Package?: Package
  GenerateWebConfig?: boolean
  WebConfigParameters?: string
  XmlTransformation?: boolean
  JSONFiles?: string[]
  XmlVariableSubstitution?: boolean
  UseWebDeploy?: boolean
  DeploymentType?: DeploymentType
  RemoveAdditionalFilesFlag?: boolean
  SetParametersFile?: string
  ExcludeFilesFromAppDataFlag?: boolean
  TakeAppOfflineFlag?: boolean
  RenameFilesFlag?: boolean
  AdditionalArguments?: string
  ScriptType?: string
  InlineScript?: string
  ScriptPath?: string
  DockerNamespace?: string
  AppSettings?: string
  StartupCommand?: string
  RuntimeStack?: string
  ConfigurationSettings?: string
  /** Additional parameters */
  isLinuxApp?: boolean
  isBuiltinLinuxWebApp?: boolean
  isContainerWebApp?: boolean
  isFunctionApp?: boolean
}
