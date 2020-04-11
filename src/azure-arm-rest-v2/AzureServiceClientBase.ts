// import * as tl from '../task-lib/task'
import * as msRestAzure from './azure-arm-common'
import * as webClient from './webClient'
import * as core from '@actions/core'
// import { DeploymentsBase } from './DeploymentsBase'

const CorrelationIdInResponse = 'x-ms-correlation-request-id'

// export class ApiResult {
//     public error;
//     public result;
//     public request;
//     public response;

//     constructor(error, result?, request?, response?) {
//         this.error = error;
//         this.result = result;
//         this.request = request;
//         this.response = response;
//     }
// }

export class AzureError {
  code?: string
  message?: string
  statusCode?: number
  details?: string
}

// export interface ApiCallback {
//     (error: any, result?: any, request?: any, response?: any): void
// }

export function ToError(response: webClient.WebResponse): AzureError {
  const error = new AzureError()
  error.statusCode = response.statusCode
  error.message = response.body
  if (response.body) {
    const body = JSON.parse(response.body)
    if (body.error) {
      error.code = body.error.code
      error.message = body.error.message
      error.details = body.error.details

      core.error(`error;code=${error.code}`)
    }
  }

  return error
}

export class AzureServiceClientBase {
  // public deployments: DeploymentsBase;

  protected credentials: msRestAzure.ApplicationTokenCredentials
  protected apiVersion?: string
  protected baseUri: string
  protected acceptLanguage?: string
  protected longRunningOperationRetryTimeout: number
  protected generateClientRequestId?: boolean

  constructor(
    credentials: msRestAzure.ApplicationTokenCredentials,
    timeout?: number
  ) {
    this.validateCredentials(credentials)

    this.credentials = credentials
    this.baseUri = this.credentials.baseUrl
    this.longRunningOperationRetryTimeout = timeout ? timeout : 0 // In minutes
  }

  // public getCredentials(): msRestAzure.ApplicationTokenCredentials {
  //     return this.credentials;
  // }

  getRequestUriForBaseUri(
    baseUri: string,
    uriFormat: string,
    parameters: {[key: string]: string},
    queryParameters?: string[],
    apiVersion?: string
  ): string {
    let requestUri = baseUri + uriFormat
    for (const key in parameters) {
      requestUri = requestUri.replace(key, encodeURIComponent(parameters[key]))
    }

    // trim all duplicate forward slashes in the url
    const regex = /([^:]\/)\/+/gi
    requestUri = requestUri.replace(regex, '$1')

    // process query paramerters
    queryParameters = queryParameters || []
    const targetApiVersion: string | undefined = apiVersion || this.apiVersion
    if (targetApiVersion) {
      queryParameters.push(
        `api-version=${encodeURIComponent(targetApiVersion)}`
      )
    } else {
      throw new Error('Could not determine api-version to use')
    }
    if (queryParameters.length > 0) {
      requestUri += `?${queryParameters.join('&')}`
    }

    return requestUri
  }

  // public setCustomHeaders(options: Object): {} {
  //     var headers = {};
  //     if (options) {
  //         for (var headerName in options['customHeaders']) {
  //             if (options['customHeaders'].hasOwnProperty(headerName)) {
  //                 headers[headerName] = options['customHeaders'][headerName];
  //             }
  //         }
  //     }
  //     return headers;
  // }

  async beginRequest(
    request: webClient.WebRequest
  ): Promise<webClient.WebResponse> {
    let token = await this.credentials.getToken()

    request.headers = request.headers || {}
    request.headers['Authorization'] = `Bearer ${token}`
    if (this.acceptLanguage) {
      request.headers['accept-language'] = this.acceptLanguage
    }
    request.headers['Content-Type'] = 'application/json; charset=utf-8'

    let httpResponse = null

    try {
      httpResponse = await webClient.sendRequest(request)
      if (httpResponse.body) {
        const body = JSON.parse(httpResponse.body)

        if (
          httpResponse.statusCode === 401 &&
          body.error &&
          body.error.code === 'ExpiredAuthenticationToken'
        ) {
          // The access token might have expire. Re-issue the request after refreshing the token.
          token = await this.credentials.getToken(true)
          request.headers['Authorization'] = `Bearer ${token}`
          httpResponse = await webClient.sendRequest(request)
        }
      }

      if (
        httpResponse.headers &&
        httpResponse.headers[CorrelationIdInResponse]
      ) {
        core.debug(
          `Correlation ID from ARM api call response : ${httpResponse.headers[CorrelationIdInResponse]}`
        )
      }
    } catch (exception) {
      const exceptionString: string = exception.toString()
      if (
        exceptionString.includes(
          "Hostname/IP doesn't match certificates's altnames"
        ) ||
        exceptionString.includes('unable to verify the first certificate') ||
        exceptionString.includes('unable to get local issuer certificate')
      ) {
        core.warning(
          "To use a certificate in App Service, the certificate must be signed by a trusted certificate authority. If your web app gives you certificate validation errors, you're probably using a self-signed certificate and to resolve them you need to set a variable named VSTS_ARM_REST_IGNORE_SSL_ERRORS to the value true in the build or release definition"
        )
      }

      throw exception
    }

    if (
      httpResponse.headers &&
      (httpResponse.headers['azure-asyncoperation'] ||
        httpResponse.headers['location'])
    ) {
      core.debug(
        `${request.uri} ==> ${httpResponse.headers['azure-asyncoperation'] ||
          httpResponse.headers['location']}`
      )
    }

    return httpResponse
  }

  // public async getLongRunningOperationResult(response: webClient.WebResponse, timeoutInMinutes?: number): Promise<webClient.WebResponse> {
  //     timeoutInMinutes = timeoutInMinutes || this.longRunningOperationRetryTimeout;
  //     var timeout = new Date().getTime() + timeoutInMinutes * 60 * 1000;
  //     var waitIndefinitely = timeoutInMinutes == 0;
  //     var ignoreTimeoutErrorThreshold = 5;
  //     var request = new webClient.WebRequest();
  //     request.method = "GET";
  //     request.uri = response.headers["azure-asyncoperation"] || response.headers["location"];
  //     if (!request.uri) {
  //         throw new Error(tl.loc("InvalidResponseLongRunningOperation"));
  //     }
  //     while (true) {
  //         try {
  //             response = await this.beginRequest(request);
  //             tl.debug(`Response status code : ${response.statusCode}`);
  //             if (response.statusCode === 202 || (response.body && (response.body.status == "Accepted" || response.body.status == "Running" || response.body.status == "InProgress"))) {
  //                 if (response.body && response.body.status) {
  //                     tl.debug(`Response status : ${response.body.status}`);
  //                 }
  //                 // If timeout; throw;
  //                 if (!waitIndefinitely && timeout < new Date().getTime()) {
  //                     throw new Error(tl.loc("TimeoutWhileWaiting"));
  //                 }

  //                 // Retry after given interval.
  //                 var sleepDuration = 15;
  //                 if (response.headers["retry-after"]) {
  //                     sleepDuration = parseInt(response.headers["retry-after"]);
  //                 }
  //                 await this.sleepFor(sleepDuration);
  //             } else {
  //                 break;
  //             }
  //         }
  //         catch (error) {
  //             let errorString: string = (!!error && error.toString()) || "";
  //             if(!!errorString && errorString.toLowerCase().indexOf("request timeout") >= 0 && ignoreTimeoutErrorThreshold > 0) {
  //                 // Ignore Request Timeout error and continue polling operation
  //                 tl.debug(`Request Timeout: ${request.uri}`);
  //                 ignoreTimeoutErrorThreshold--;
  //             }
  //             else {
  //                 throw error;
  //             }
  //         }
  //     }

  //     return response;
  // }

  // public async beginRequestExpBackoff(request: webClient.WebRequest, maxAttempt: number): Promise<webClient.WebResponse> {
  //     var sleepDuration = 1;
  //     for(var i = 1; true; i++) {
  //         var response : webClient.WebResponse = await this.beginRequest(request);
  //         //not a server error;
  //         if(response.statusCode <500) {
  //             return response;
  //         }

  //         // response of last attempt
  //         if(i == maxAttempt) {
  //             return response;
  //         }

  //         // Retry after given interval.
  //         sleepDuration = sleepDuration + i;
  //         if (response.headers["retry-after"]) {
  //             sleepDuration = parseInt(response.headers["retry-after"]);
  //         }

  //         tl.debug(tl.loc("RetryingRequest", sleepDuration));
  //         await this.sleepFor(sleepDuration);
  //     }
  // }

  // public async accumulateResultFromPagedResult(nextLinkUrl: string): Promise<ApiResult> {
  //     var result = [];
  //     while (nextLinkUrl) {
  //         var nextRequest = new webClient.WebRequest();
  //         nextRequest.method = 'GET';
  //         nextRequest.uri = nextLinkUrl;
  //         var response = await this.beginRequest(nextRequest);
  //         if (response.statusCode == 200 && response.body) {
  //             if (response.body.value) {
  //                 result = result.concat(response.body.value);
  //             }

  //             nextLinkUrl = response.body.nextLink;
  //         }
  //         else {
  //             return new ApiResult(ToError(response));
  //         }
  //     }

  //     return new ApiResult(null, result);
  // }

  // public isNameValid(name: string): boolean {
  //     if (name === null || name === undefined || typeof name.valueOf() !== 'string') {
  //         return false;
  //     }else{
  //         return true;
  //     }
  // }

  getFormattedError(error: AzureError): string {
    if (error && error.message) {
      if (error.statusCode) {
        // const errorMessage =
        //   typeof error.message.valueOf() === 'string'
        //     ? error.message
        //     : `${error.message.Code || error.message.code} - ${error.message
        //         .Message || error.message.message}`
        error.message = `${error.message} (CODE: ${error.statusCode})`
      }

      return error.message
    }

    return JSON.stringify(error)
  }

  protected validateCredentials(
    credentials: msRestAzure.ApplicationTokenCredentials
  ): void {
    if (!credentials) {
      throw new Error("'credentials' cannot be null.")
    }
  }

  // protected getRequestUri(uriFormat: string, parameters: {}, queryParameters?: string[], apiVersion?: string): string {
  //     return this.getRequestUriForBaseUri(this.baseUri, uriFormat, parameters, queryParameters, apiVersion);
  // }

  // private sleepFor(sleepDurationInSeconds): Promise<any> {
  //     return new Promise((resolve, reeject) => {
  //         setTimeout(resolve, sleepDurationInSeconds * 1000);
  //     });
  // }
}
