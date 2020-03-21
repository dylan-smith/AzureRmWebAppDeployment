import * as tl from '../task-lib/task'
import * as core from '@actions/core'
import {TaskParameters} from './TaskParameters'
import * as fs from 'fs'
import * as Constant from './Constants'
import * as path from 'path'
import * as Q from 'q'
import * as packageUtility from '../webdeployment-common-v2/packageUtility'
import {parseString} from 'xml2js'
import * as util from 'util'

const ERROR_FILE_NAME = 'error.txt'

export interface IPubXml {
  Project: IPubXmlPropertyGroupCollection
}

export interface IPubXmlPropertyGroupCollection {
  PropertyGroup?: IPubXmlPropertyGroup[]
}

export interface IPubXmlPropertyGroup {
  WebPublishMethod: string[]
  MSDeployServiceURL: string[]
  DeployIisAppPath: string[]
  UserName: string[]
  EnableMSDeployAppOffline: string[]
  SkipExtraFilesOnServer: string[]
  SiteUrlToLaunchAfterPublish: string[]
}

export interface PublishingProfile {
  PublishUrl: string
  UserName: string
  UserPWD: string
  WebAppName: string
  TakeAppOfflineFlag: boolean
  RemoveAdditionalFilesFlag: boolean
}

export class PublishProfileUtility {
  private _publishProfileJs?: IPubXmlPropertyGroup
  private _publishProfilePath: string

  constructor(publishProfilePath: string) {
    this._publishProfilePath = publishProfilePath
  }

  async GetTaskParametersFromPublishProfileFile(
    taskParams: TaskParameters
  ): Promise<PublishingProfile> {
    try {
      if (this._publishProfileJs === null) {
        this._publishProfileJs = await this.GetPublishProfileJsonFromFile()
      }
    } catch (error) {
      throw new Error(error)
    }

    if (this._publishProfileJs) {
      const msDeployPublishingProfile: PublishingProfile = {
        WebAppName: this._publishProfileJs.DeployIisAppPath[0],
        TakeAppOfflineFlag: this._publishProfileJs.hasOwnProperty(
          Constant.PublishProfileXml.EnableMSDeployAppOffline
        )
          ? this._publishProfileJs.EnableMSDeployAppOffline[0] === 'true'
          : false,
        RemoveAdditionalFilesFlag: this._publishProfileJs.hasOwnProperty(
          Constant.PublishProfileXml.SkipExtraFilesOnServer
        )
          ? this._publishProfileJs.SkipExtraFilesOnServer[0] === 'true'
          : false,
        PublishUrl: this._publishProfileJs.MSDeployServiceURL[0],
        UserName: this._publishProfileJs.UserName[0],
        UserPWD: taskParams.PublishProfilePassword || ''
      }
      return msDeployPublishingProfile
    }

    throw new Error('Publish Profile not set')
  }

  async GetPropertyValuefromPublishProfile(
    propertyKey: keyof IPubXmlPropertyGroup
  ): Promise<string> {
    try {
      if (this._publishProfileJs === null) {
        this._publishProfileJs = await this.GetPublishProfileJsonFromFile()
      }
    } catch (error) {
      throw new Error(error)
    }

    return new Promise((response, reject) => {
      if (this._publishProfileJs) {
        this._publishProfileJs.hasOwnProperty(propertyKey)
          ? response(this._publishProfileJs[propertyKey][0])
          : reject(
              util.format(
                '[%s] Property does not exist in publish profile',
                propertyKey
              )
            )
      }

      throw new Error('Publish Profile not set')
    })
  }

  private async GetPublishProfileJsonFromFile(): Promise<IPubXmlPropertyGroup> {
    return new Promise((response, reject) => {
      const pubxmlFile = packageUtility.PackageUtility.getPackagePath(
        this._publishProfilePath
      )
      const publishProfileXML = fs.readFileSync(pubxmlFile)
      parseString(publishProfileXML, (error, result: IPubXml) => {
        if (error) {
          reject(
            util.format(
              'Unable to parse publishProfileXML file, Error: %s',
              error
            )
          )
        }
        const propertyGroups =
          result && result.Project && result.Project.PropertyGroup
            ? result.Project.PropertyGroup
            : undefined
        if (propertyGroups) {
          for (const propertyGroup of propertyGroups) {
            if (
              propertyGroup.WebPublishMethod &&
              propertyGroup.WebPublishMethod.length > 0 &&
              propertyGroup.WebPublishMethod[0] ===
                Constant.PublishProfileXml.MSDeploy
            ) {
              if (
                !propertyGroup.hasOwnProperty(
                  Constant.PublishProfileXml.MSDeployServiceURL
                ) ||
                !propertyGroup.hasOwnProperty(
                  Constant.PublishProfileXml.DeployIisAppPath
                ) ||
                !propertyGroup.hasOwnProperty(
                  Constant.PublishProfileXml.UserName
                )
              ) {
                reject(new Error('Publish profile file is invalid.'))
              }
              core.debug(`Publish Profile: ${JSON.stringify(propertyGroup)}`)
              response(propertyGroup)
            }
          }
        }
        reject(new Error('Error : No such deploying method exists'))
      })
    })
  }

  async RunCmd(cmdTool: string, cmdArgs: string): Promise<void> {
    const deferred = Q.defer<void>()
    let cmdError: Error
    const errorFile = path.join(
      tl.getVariable('GITHUB_WORKSPACE') || '',
      ERROR_FILE_NAME
    )
    const errObj = fs.createWriteStream(errorFile)
    errObj.on('finish', () => {
      if (cmdError) {
        deferred.reject(cmdError)
      } else {
        deferred.resolve()
      }
    })

    try {
      await tl.exec(cmdTool, cmdArgs, {
        errStream: errObj,
        outStream: process.stdout,
        failOnStdErr: true,
        windowsVerbatimArguments: true
      })
    } catch (error) {
      cmdError = error
    } finally {
      errObj.end()
    }

    return deferred.promise
  }
}
