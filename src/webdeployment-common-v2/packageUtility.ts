//import tl = require('azure-pipelines-task-lib/task');
//import utility = require('./utility');
//var zipUtility = require('webdeployment-common-v2/ziputility.js');
//import path = require('path');

import * as utility from './utility'
import * as util from 'util'
import * as core from '@actions/core'
import * as zipUtility from './zipUtility'
import * as fs from 'fs'
import * as tl from '../task-lib/task'

export enum PackageType {
  war,
  zip,
  jar,
  folder
}

export const PackageUtility = {
  getPackagePath(packagePath: string): string {
    const availablePackages: string[] = utility.findfiles(packagePath)
    if (availablePackages.length === 0) {
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

  getPath(): string {
    return this._path
  }

  async isMSBuildPackage(): Promise<boolean> {
    if (this._isMSBuildPackage === undefined) {
      this._isMSBuildPackage = false
      if (this.getPackageType() !== PackageType.folder) {
        const packageComponent = await zipUtility.getArchivedEntries(this._path)
        if (
          (packageComponent['entries'].includes('parameters.xml') ||
            packageComponent['entries'].includes('Parameters.xml')) &&
          (packageComponent['entries'].includes('systemInfo.xml') ||
            packageComponent['entries'].includes('systeminfo.xml') ||
            packageComponent['entries'].includes('SystemInfo.xml'))
        ) {
          this._isMSBuildPackage = true
        }
      }

      core.debug(
        `Is the package an msdeploy package : ${this._isMSBuildPackage}`
      )
    }

    return this._isMSBuildPackage
  }

  getPackageType(): PackageType {
    if (this._packageType === undefined) {
      if (!tl.exist(this._path)) {
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
        } else if (!fs.statSync(this._path).isFile()) {
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

  isFolder(): boolean {
    if (this._isFolder === undefined) {
      if (!tl.exist(this._path)) {
        throw new Error(
          util.format(
            'Invalid App Service package or folder path provided: %s',
            this._path
          )
        )
      }

      this._isFolder = !fs.statSync(this._path).isFile()
    }

    return this._isFolder
  }

  private _isFolder?: boolean
  private _path: string
  private _isMSBuildPackage?: boolean
  private _packageType?: PackageType
}
