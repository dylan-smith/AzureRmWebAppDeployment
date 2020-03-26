// import tl = require('azure-pipelines-task-lib/task');
// import webClient = require('azure-arm-rest-v2/webClient');
// import { Kudu } from 'azure-arm-rest-v2/azure-arm-app-service-kudu';

import {parseString} from 'xml2js'
import Q from 'q'
import {AzureAppService} from '../azure-arm-rest-v2/azure-arm-app-service'
// import { AzureDeployPackageArtifactAlias } from './Constants';
import * as core from '@actions/core'
// import * as util from 'util'
// import * as tl from '../task-lib/task'
import * as webClient from '../azure-arm-rest-v2/webClient'

export class AzureAppServiceUtility {
  private _appService: AzureAppService
  constructor(appService: AzureAppService) {
    this._appService = appService
  }

  // public async updateScmTypeAndConfigurationDetails(): Promise<void> {
  //     try {
  //         var configDetails = await this._appService.getConfiguration();
  //         var scmType: string = configDetails.properties.scmType;
  //         let shouldUpdateMetadata = false;
  //         if (scmType && scmType.toLowerCase() === "none") {
  //             configDetails.properties.scmType = 'VSTSRM';
  //             core.debug('updating SCM Type to VSTS-RM');
  //             await this._appService.updateConfiguration(configDetails);
  //             core.debug('updated SCM Type to VSTS-RM');
  //             shouldUpdateMetadata = true;
  //         }
  //         else if (scmType && scmType.toLowerCase() == "vstsrm") {
  //             core.debug("SCM Type is VSTSRM");
  //             shouldUpdateMetadata = true;
  //         }
  //         else {
  //             core.debug(`Skipped updating the SCM value. Value: ${scmType}`);
  //         }

  //         if (shouldUpdateMetadata) {
  //             core.debug('Updating metadata with latest pipeline details');
  //             let newMetadataProperties = this._getNewMetadata();
  //             let siteMetadata = await this._appService.getMetadata();
  //             let skipUpdate = true;
  //             for (let property in newMetadataProperties) {
  //                 if (siteMetadata.properties[property] !== newMetadataProperties[property]) {
  //                     siteMetadata.properties[property] = newMetadataProperties[property];
  //                     skipUpdate = false;
  //                 }
  //             }

  //             if (!skipUpdate) {
  //                 await this._appService.patchMetadata(siteMetadata.properties);
  //                 core.debug('Updated metadata with latest pipeline details');
  //                 core.info("Successfully updated App Service configuration details");
  //             }
  //             else {
  //                 core.debug("No changes in metadata properties, skipping update.");
  //             }
  //         }
  //     }
  //     catch (error) {
  //         core.warning(util.format("Failed to update App Service configuration details. Error: %s", error));
  //     }
  // }

  public async getWebDeployPublishingProfile(): Promise<any> {
    var publishingProfile = await this._appService.getPublishingProfileWithSecrets()
    var defer = Q.defer<any>()
    parseString(publishingProfile, (error, result) => {
      if (!!error) {
        defer.reject(error)
      }
      var publishProfile =
        result && result.publishData && result.publishData.publishProfile
          ? result.publishData.publishProfile
          : null
      if (publishProfile) {
        for (var index in publishProfile) {
          if (
            publishProfile[index].$ &&
            publishProfile[index].$.publishMethod === 'MSDeploy'
          ) {
            defer.resolve(result.publishData.publishProfile[index].$)
          }
        }
      }

      defer.reject('Error : No such deploying method exists')
    })

    return defer.promise
  }

  public async getApplicationURL(virtualApplication?: string): Promise<string> {
    let webDeployProfile: any = await this.getWebDeployPublishingProfile()
    return (
      (await webDeployProfile.destinationAppUrl) +
      (virtualApplication ? `/${virtualApplication}` : '')
    )
  }

  public async pingApplication(): Promise<void> {
    try {
      var applicationUrl: string = await this.getApplicationURL()

      if (!applicationUrl) {
        core.debug('Application Url not found.')
        return
      }
      await AzureAppServiceUtility.pingApplication(applicationUrl)
    } catch (error) {
      core.debug('Unable to ping App Service. Error: ${error}')
    }
  }

  public static async pingApplication(applicationUrl: string) {
    if (!applicationUrl) {
      core.debug('Application Url empty.')
      return
    }
    try {
      var webRequest = new webClient.WebRequest()
      webRequest.method = 'GET'
      webRequest.uri = applicationUrl
      let webRequestOptions: webClient.WebRequestOptions = {
        retriableErrorCodes: [],
        retriableStatusCodes: [],
        retryCount: 1,
        retryIntervalInSeconds: 5,
        retryRequestTimedout: true
      }
      var response = await webClient.sendRequest(webRequest, webRequestOptions)
      core.debug(
        `App Service status Code: '${response.statusCode}'. Status Message: '${response.statusMessage}'`
      )
    } catch (error) {
      core.debug(`Unable to ping App Service. Error: ${error}`)
    }
  }

  // public async getKuduService(): Promise<Kudu> {
  //     var publishingCredentials = await this._appService.getPublishingCredentials();
  //     if(publishingCredentials.properties["scmUri"]) {
  //         core.setSecret(publishingCredentials.properties["publishingPassword"]);
  //         core.exportVariable(`AZURE_APP_SERVICE_KUDI${this._appService.getSlot()}_PASSWORD`, publishingCredentials.properties["publishingPassword"]);
  //         return new Kudu(publishingCredentials.properties["scmUri"], publishingCredentials.properties["publishingUserName"], publishingCredentials.properties["publishingPassword"]);
  //     }

  //     throw Error("KUDU SCM details are empty");
  // }

  // public async getPhysicalPath(virtualApplication: string): Promise<string> {

  //     if(!virtualApplication) {
  //         return '/site/wwwroot';
  //     }

  //     virtualApplication = (virtualApplication.startsWith("/")) ? virtualApplication.substr(1) : virtualApplication;

  //     var physicalToVirtualPathMap = await this._getPhysicalToVirtualPathMap(virtualApplication);

  //     if(!physicalToVirtualPathMap) {
  //         throw Error(util.format("Virtual application doesn't exists : %s", virtualApplication));
  //     }

  //     core.debug(`Virtual Application Map: Physical path: '${physicalToVirtualPathMap.physicalPath}'. Virtual path: '${physicalToVirtualPathMap.virtualPath}'.`);
  //     return physicalToVirtualPathMap.physicalPath;
  // }

  // public async updateConfigurationSettings(properties: any) : Promise<void> {
  //     for(var property in properties) {
  //         if(!!properties[property] && properties[property].value !== undefined) {
  //             properties[property] = properties[property].value;
  //         }
  //     }

  //     core.info(util.format("Trying to update App Service Configuration settings. Data: %s", JSON.stringify(properties)));
  //     await this._appService.patchConfiguration({'properties': properties});
  //     core.info("Updated App Service Configuration settings.");
  // }

  // public async updateAndMonitorAppSettings(addProperties: any, deleteProperties?: any): Promise<boolean> {
  //     for(var property in addProperties) {
  //         if(!!addProperties[property] && addProperties[property].value !== undefined) {
  //             addProperties[property] = addProperties[property].value;
  //         }
  //     }

  //     core.info(util.format("Trying to update App Service Application settings. Data: %s", JSON.stringify(addProperties)));
  //     var isNewValueUpdated: boolean = await this._appService.patchApplicationSettings(addProperties, deleteProperties);

  //     if(!!isNewValueUpdated) {
  //         core.info("Updated App Service Application settings and Kudu Application settings.");
  //     }
  //     else {
  //         core.info("App Service Application settings are already present.");
  //         return isNewValueUpdated;
  //     }

  //     var kuduService = await this.getKuduService();
  //     var noOftimesToIterate: number = 12;
  //     core.debug('retrieving values from Kudu service to check if new values are updated');
  //     while(noOftimesToIterate > 0) {
  //         var kuduServiceAppSettings = await kuduService.getAppSettings();
  //         var propertiesChanged: boolean = true;
  //         for(var property in addProperties) {
  //             if(kuduServiceAppSettings[property] != addProperties[property]) {
  //                 core.debug('New properties are not updated in Kudu service :(');
  //                 propertiesChanged = false;
  //                 break;
  //             }
  //         }
  //         for(var property in deleteProperties) {
  //             if(kuduServiceAppSettings[property]) {
  //                 core.debug('Deleted properties are not reflected in Kudu service :(');
  //                 propertiesChanged = false;
  //                 break;
  //             }
  //         }

  //         if(propertiesChanged) {
  //             core.debug('New properties are updated in Kudu service.');
  //             core.info("Updated App Service Application settings and Kudu Application settings.");
  //             return isNewValueUpdated;
  //         }

  //         noOftimesToIterate -= 1;
  //         await webClient.sleepFor(5);
  //     }

  //     core.debug('Timing out from app settings check');
  //     return isNewValueUpdated;
  // }

  // public async enableRenameLockedFiles(): Promise<void> {
  //     try {
  //         var webAppSettings = await this._appService.getApplicationSettings();
  //         if(webAppSettings && webAppSettings.properties) {
  //             if(webAppSettings.properties.MSDEPLOY_RENAME_LOCKED_FILES !== '1') {
  //                 core.debug(`Rename locked files value found to be ${webAppSettings.properties.MSDEPLOY_RENAME_LOCKED_FILES}. Updating the value to 1`);
  //                 await this.updateAndMonitorAppSettings({ 'MSDEPLOY_RENAME_LOCKED_FILES' : '1' });
  //                 core.info("Rename locked files enabled for App Service.");
  //             }
  //             else {
  //                 core.debug('Rename locked files is already enabled in App Service');
  //             }
  //         }
  //     }
  //     catch(error) {
  //         throw new Error(util.format("Failed to enable rename locked files. Error: %s", error));
  //     }
  // }

  // public async updateStartupCommandAndRuntimeStack(runtimeStack: string, startupCommand?: string): Promise<void> {
  //     var configDetails = await this._appService.getConfiguration();
  //     var appCommandLine: string = configDetails.properties.appCommandLine;
  //     startupCommand = (!!startupCommand) ? startupCommand  : appCommandLine;
  //     var linuxFxVersion: string = configDetails.properties.linuxFxVersion;
  //     runtimeStack = (!!runtimeStack) ? runtimeStack : linuxFxVersion;

  //     if (appCommandLine != startupCommand || runtimeStack != linuxFxVersion) {
  //         await this.updateConfigurationSettings({linuxFxVersion: runtimeStack, appCommandLine: startupCommand});
  //     }
  //     else {
  //         core.debug(`Skipped updating the values. linuxFxVersion: ${linuxFxVersion} : appCommandLine: ${appCommandLine}`)
  //     }
  // }

  // private async _getPhysicalToVirtualPathMap(virtualApplication: string): Promise<any> {
  //     // construct URL depending on virtualApplication or root of webapplication
  //     var physicalPath = null;
  //     var virtualPath = "/" + virtualApplication;
  //     var appConfigSettings = await this._appService.getConfiguration();
  //     var virtualApplicationMappings = appConfigSettings.properties && appConfigSettings.properties.virtualApplications;

  //     if(virtualApplicationMappings) {
  //         for( var mapping of virtualApplicationMappings ) {
  //             if(mapping.virtualPath.toLowerCase() == virtualPath.toLowerCase()) {
  //                 physicalPath = mapping.physicalPath;
  //                 break;
  //             }
  //         }
  //     }

  //     return physicalPath ? {
  //         'virtualPath': virtualPath,
  //         'physicalPath': physicalPath
  //     }: null;
  // }

  // private _getNewMetadata(): any {
  //     var collectionUri = tl.getVariable("system.teamfoundationCollectionUri");
  //     var projectId = tl.getVariable("system.teamprojectId");
  //     var releaseDefinitionId = tl.getVariable("release.definitionId");

  //     // Log metadata properties based on whether task is running in build OR release.

  //     let newProperties = {
  //         VSTSRM_ProjectId: projectId,
  //         VSTSRM_AccountId: tl.getVariable("system.collectionId")
  //     }

  //     if(!!releaseDefinitionId) {
  //         // Task is running in Release
  //         var artifactAlias = tl.getVariable(AzureDeployPackageArtifactAlias);
  //         core.debug("Artifact Source Alias is: "+ artifactAlias);

  //         let buildDefinitionUrl = "";
  //         let buildDefinitionId = "";

  //         if (artifactAlias) {
  //             let artifactType = tl.getVariable(`release.artifacts.${artifactAlias}.type`);
  //             // Get build definition info only when artifact type is build.
  //             if (artifactType && artifactType.toLowerCase() == "build") {

  //                 buildDefinitionId = tl.getVariable("build.definitionId") || '';
  //                 let buildProjectId = tl.getVariable("build.projectId") || projectId;
  //                 let artifactBuildDefinitionId = tl.getVariable("release.artifacts." + artifactAlias + ".definitionId");
  //                 let artifactBuildProjectId = tl.getVariable("release.artifacts." + artifactAlias + ".projectId");

  //                 if (artifactBuildDefinitionId && artifactBuildProjectId) {
  //                     buildDefinitionId = artifactBuildDefinitionId;
  //                     buildProjectId = artifactBuildProjectId;
  //                 }

  //                 buildDefinitionUrl = collectionUri + buildProjectId + "/_build?_a=simple-process&definitionId=" + buildDefinitionId;
  //             }
  //         }

  //         newProperties["VSTSRM_BuildDefinitionId"] = buildDefinitionId;
  //         newProperties["VSTSRM_ReleaseDefinitionId"] = releaseDefinitionId;
  //         newProperties["VSTSRM_BuildDefinitionWebAccessUrl"] = buildDefinitionUrl;
  //         newProperties["VSTSRM_ConfiguredCDEndPoint"] = collectionUri + projectId + "/_apps/hub/ms.vss-releaseManagement-web.hub-explorer?definitionId=" + releaseDefinitionId;
  //     }
  //     else {
  //         // Task is running in Build
  //         let buildDefintionId = tl.getVariable("system.definitionId");
  //         newProperties["VSTSRM_BuildDefinitionId"] = buildDefintionId;
  //         let buildDefinitionUrl = collectionUri + projectId + "/_build?_a=simple-process&definitionId=" + buildDefintionId;
  //         newProperties["VSTSRM_BuildDefinitionWebAccessUrl"] = buildDefinitionUrl
  //         newProperties["VSTSRM_ConfiguredCDEndPoint"] = buildDefinitionUrl;
  //     }

  //     return newProperties;
  // }
}
