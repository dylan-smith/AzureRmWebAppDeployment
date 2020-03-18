//import tl = require('azure-pipelines-task-lib/task');
//import utility = require('./utility');
//var zipUtility = require('webdeployment-common-v2/ziputility.js');
//import path = require('path');

import * as utility from './ActionUtility'
import * as util from 'util'
import * as core from '@actions/core'
import * as zipUtility from './zipUtility'

export enum PackageType {
  war,
  zip,
  jar,
  folder
}

export class PackageUtility {
  public static getPackagePath(packagePath: string): string {
    var availablePackages: string[] = utility.findfiles(packagePath)
    if (availablePackages.length == 0) {
      throw new Error(
        util.format(
          'No package found with specified pattern: %s<br/>Check if the package mentioned in the task is published as an artifact in the build or a previous stage and downloaded in the current job.',
          packagePath
        )
      )
    }

    if (availablePackages.length > 1) {
      throw new Error(
        util.format(
          'More than one package matched with specified pattern: %s. Please restrain the search pattern.',
          packagePath
        )
      )
    }

    return availablePackages[0]
  }
}

export class Package {
  constructor(packagePath: string) {
    this._path = PackageUtility.getPackagePath(packagePath)
    this._isMSBuildPackage = undefined
  }

  public getPath(): string {
    return this._path
  }

  public async isMSBuildPackage(): Promise<boolean> {
    if (this._isMSBuildPackage == undefined) {
      this._isMSBuildPackage = false
      if (this.getPackageType() != PackageType.folder) {
        var pacakgeComponent = await zipUtility.getArchivedEntries(this._path)
        if (
          (pacakgeComponent['entries'].indexOf('parameters.xml') > -1 ||
            pacakgeComponent['entries'].indexOf('Parameters.xml') > -1) &&
          (pacakgeComponent['entries'].indexOf('systemInfo.xml') > -1 ||
            pacakgeComponent['entries'].indexOf('systeminfo.xml') > -1 ||
            pacakgeComponent['entries'].indexOf('SystemInfo.xml') > -1)
        ) {
          this._isMSBuildPackage = true
        }
      }

      core.debug(
        'Is the package an msdeploy package : ' + this._isMSBuildPackage
      )
    }

    return this._isMSBuildPackage
  }

  public getPackageType(): PackageType {
    if (this._packageType == undefined) {
      if (!utility.exist(this._path)) {
        throw new Error(
          util.format(this, [
            'Invalid App Service package or folder path provided: %s',
            this._path
          ])
        )
      } else {
        if (this._path.toLowerCase().endsWith('.war')) {
          this._packageType = PackageType.war
          core.debug('This is war package ')
        } else if (this._path.toLowerCase().endsWith('.jar')) {
          this._packageType = PackageType.jar
          core.debug('This is jar package ')
        } else if (this._path.toLowerCase().endsWith('.zip')) {
          this._packageType = PackageType.zip
          core.debug('This is zip package ')
        } else if (!utility.stats(this._path).isFile()) {
          this._packageType = PackageType.folder
          core.debug('This is folder package ')
        } else {
          throw new Error(
            util.format(
              'Invalid App Service package or folder path provided: %s',
              this._path
            )
          )
        }
      }
    }
    return this._packageType
  }

  public isFolder(): boolean {
    if (this._isFolder == undefined) {
      if (!utility.exist(this._path)) {
        throw new Error(
          util.format(
            'Invalid App Service package or folder path provided: %s',
            this._path
          )
        )
      }

      this._isFolder = !utility.stats(this._path).isFile()
    }

    return this._isFolder
  }

  private _isFolder?: boolean
  private _path: string
  private _isMSBuildPackage?: boolean
  private _packageType?: PackageType
}
