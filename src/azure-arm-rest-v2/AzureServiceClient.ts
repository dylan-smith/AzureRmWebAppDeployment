import * as msRestAzure from './azure-arm-common'
import {AzureServiceClientBase, AzureError} from './AzureServiceClientBase'

export class ServiceClient extends AzureServiceClientBase {
  public subscriptionId: string

  constructor(
    credentials: msRestAzure.ApplicationTokenCredentials,
    subscriptionId: string,
    timeout?: number
  ) {
    super(credentials, timeout)
    this.validateInputs(subscriptionId)
    this.subscriptionId = subscriptionId
  }

  public getRequestUri(
    uriFormat: string,
    parameters: {[key: string]: string},
    queryParameters?: string[],
    apiVersion?: string
  ): string {
    parameters['{subscriptionId}'] = encodeURIComponent(this.subscriptionId)
    return super.getRequestUriForBaseUri(
      this.baseUri,
      uriFormat,
      parameters,
      queryParameters,
      apiVersion
    )
  }

  public isValidResourceGroupName(resourceGroupName: string) {
    if (
      !resourceGroupName === null ||
      resourceGroupName === undefined ||
      typeof resourceGroupName.valueOf() !== 'string'
    ) {
      throw new Error(
        'resourceGroupName cannot be null or undefined and it must be of type string.'
      )
    }
    if (resourceGroupName !== null && resourceGroupName !== undefined) {
      if (resourceGroupName.length > 90) {
        throw new Error(
          '"resourceGroupName" should satisfy the constraint - "MaxLength": 90'
        )
      }
      if (resourceGroupName.length < 1) {
        throw new Error(
          '"resourceGroupName" should satisfy the constraint - "MinLength": 1'
        )
      }
      if (resourceGroupName.match(/^[-\w\._\(\)]+$/) === null) {
        throw new Error(
          '"resourceGroupName" should satisfy the constraint - "Pattern": /^[-\\w\\._\\(\\)]+$/'
        )
      }
    }
  }

  protected validateInputs(subscriptionId: string) {
    if (!subscriptionId) {
      throw new Error("'subscriptionId' cannot be null.")
    }
  }
}
