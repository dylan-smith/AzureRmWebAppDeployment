//import tl = require('azure-pipelines-task-lib/task');
//import * as Constant from '../operations/Constants'
//import { Package, PackageType } from 'webdeployment-common-v2/packageUtility';
//var webCommonUtility = require('webdeployment-common-v2/utility.js');

import * as core from '@actions/core'
import * as utility from './ActionUtility'
import * as Constant from '../operations/Constants'
import {Package, PackageType} from './packageUtility'
import * as util from 'util'

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
      DeployToSlotOrASEFlag: utility.getBoolInput('DeployToSlotOrASEFlag'),
      GenerateWebConfig: utility.getBoolInput('GenerateWebConfig'),
      WebConfigParameters: core.getInput('WebConfigParameters'),
      XmlTransformation: utility.getBoolInput('XmlTransformation'),
      JSONFiles: utility.getDelimitedInput('JSONFiles', '\n'),
      XmlVariableSubstitution: utility.getBoolInput('XmlVariableSubstitution'),
      TakeAppOfflineFlag: utility.getBoolInput('TakeAppOfflineFlag'),
      RenameFilesFlag: utility.getBoolInput('RenameFilesFlag'),
      AdditionalArguments: core.getInput('AdditionalArguments'),
      ScriptType: core.getInput('ScriptType'),
      InlineScript: core.getInput('InlineScript'),
      ScriptPath: utility.getPathInput('ScriptPath'),
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
        utility.getPathInput('Package', {required: true})
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
          const jarPath = utility.getFileNameFromPath(
            taskParameters.Package.getPath()
          )
          taskParameters.WebConfigParameters = taskParameters.WebConfigParameters.replace(
            'D:\\home\\site\\wwwroot\\*.jar',
            jarPath
          )
        } else if (!taskParameters.WebConfigParameters.includes('-JAR_PATH ')) {
          const jarPath = utility.getFileNameFromPath(
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
      ? utility.getBoolInput('UseWebDeploy')
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
        taskParameters.RemoveAdditionalFilesFlag = utility.getBoolInput(
          'RemoveAdditionalFilesFlag'
        )
        taskParameters.SetParametersFile = utility.getPathInput(
          'SetParametersFile'
        )
        taskParameters.ExcludeFilesFromAppDataFlag = utility.getBoolInput(
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
      utility.getPathInput('Package', {required: true})
    )
    taskParameters.AdditionalArguments = '-retryAttempts:6 -retryInterval:10000'
  },

  UpdateLinuxAppTypeScriptParameters(taskParameters: TaskParameters) {
    const retryTimeoutValue = utility.getVariable(
      'appservicedeploy.retrytimeout'
    )
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
