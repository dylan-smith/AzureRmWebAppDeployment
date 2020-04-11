// import tl = require('azure-pipelines-task-lib/task');
// import Q = require('q');
// import querystring = require('querystring');
// import webClient = require("./webClient");
// import AzureModels = require("./azureModels");
// import constants = require('./constants');
// import path = require('path');
// import fs = require('fs');
// var jwt = require('jsonwebtoken');

import * as Q from 'q'
import * as path from 'path'
import * as fs from 'fs'
import * as constants from './constants'
import * as AzureModels from './azureModels'
import * as core from '@actions/core'
import * as tl from '../task-lib/task'
import * as os from 'os'
import * as querystring from 'querystring'
import * as util from 'util'
import * as jwt from 'jsonwebtoken'
import * as webClient from './webClient'

interface IJWTHeaders {
  alg: string
  typ: string
  x5t?: string
}

export class ApplicationTokenCredentials {
  private clientId: string
  private domain: string
  private authType?: string
  private secret?: string
  private accessToken?: string
  private certFilePath?: string
  private isADFSEnabled: boolean
  baseUrl: string
  authorityUrl: string
  activeDirectoryResourceId: string
  isAzureStackEnvironment: boolean
  scheme: number
  msiClientId?: string
  private tokenDeferred?: Promise<string>

  constructor(
    clientId: string,
    domain: string,
    secret: string,
    baseUrl: string,
    authorityUrl: string,
    activeDirectoryResourceId: string,
    isAzureStackEnvironment: boolean,
    scheme?: string,
    msiClientId?: string,
    authType?: string,
    certFilePath?: string,
    isADFSEnabled?: boolean,
    accessToken?: string
  ) {
    if (!domain || typeof domain.valueOf() !== 'string') {
      throw new Error('domain must be a non empty string.')
    }

    if (!scheme || scheme === 'ServicePrincipal') {
      if (!clientId || typeof clientId.valueOf() !== 'string') {
        throw new Error('clientId must be a non empty string.')
      }

      if (
        !authType ||
        authType ===
          constants.AzureServicePrinicipalAuthentications.servicePrincipalKey
      ) {
        if (!secret || typeof secret.valueOf() !== 'string') {
          throw new Error('secret must be a non empty string.')
        }
      } else {
        if (
          !certFilePath ||
          !certFilePath ||
          typeof certFilePath.valueOf() !== 'string'
        ) {
          throw new Error('cert file path must be provided')
        }
      }
    }

    if (!baseUrl || typeof baseUrl.valueOf() !== 'string') {
      throw new Error('arm Url must be a non empty string.')
    }

    if (!authorityUrl || typeof authorityUrl.valueOf() !== 'string') {
      throw new Error('authority must be a non empty string.')
    }

    if (
      !activeDirectoryResourceId ||
      typeof activeDirectoryResourceId.valueOf() !== 'string'
    ) {
      throw new Error('Active directory resource url cannot be empty.')
    }

    if (
      !isAzureStackEnvironment ||
      typeof isAzureStackEnvironment.valueOf() != 'boolean'
    ) {
      isAzureStackEnvironment = false
    }

    this.clientId = clientId
    this.domain = domain
    this.baseUrl = baseUrl
    this.authorityUrl = authorityUrl
    this.activeDirectoryResourceId = activeDirectoryResourceId
    this.isAzureStackEnvironment = isAzureStackEnvironment

    this.scheme = scheme
      ? AzureModels.Scheme[scheme as keyof typeof AzureModels.Scheme]
      : AzureModels.Scheme.SPN
    this.msiClientId = msiClientId
    if (this.scheme === AzureModels.Scheme.SPN) {
      this.authType = authType
        ? authType
        : constants.AzureServicePrinicipalAuthentications.servicePrincipalKey
      if (
        this.authType ===
        constants.AzureServicePrinicipalAuthentications.servicePrincipalKey
      ) {
        this.secret = secret
      } else {
        this.certFilePath = certFilePath
      }
    }

    this.isADFSEnabled = isADFSEnabled || false
    this.accessToken = accessToken
  }

  async getToken(force?: boolean): Promise<string> {
    if (!!this.accessToken && !force) {
      core.debug(
        '==================== USING ENDPOINT PROVIDED ACCESS TOKEN ===================='
      )
      const deferred = Q.defer<string>()
      deferred.resolve(this.accessToken)
      return deferred.promise
    }

    if (!this.tokenDeferred || force) {
      if (this.scheme === AzureModels.Scheme.ManagedServiceIdentity) {
        this.tokenDeferred = this._getMSIAuthorizationToken(0, 0)
      } else {
        this.tokenDeferred = this._getSPNAuthorizationToken()
      }
    }

    return this.tokenDeferred
  }

  getDomain(): string {
    return this.domain
  }

  getClientId(): string {
    return this.clientId
  }

  private async _getMSIAuthorizationToken(
    retyCount: number,
    timeToWait: number
  ): Promise<string> {
    const deferred = Q.defer<string>()
    const webRequest = new webClient.WebRequest()
    webRequest.method = 'GET'
    const apiVersion = '2018-02-01'
    const retryLimit = 5
    const msiClientId = this.msiClientId ? `&client_id=${this.msiClientId}` : ''
    webRequest.uri = `http://169.254.169.254/metadata/identity/oauth2/token?api-version=${apiVersion}&resource=${this.baseUrl}${msiClientId}`
    webRequest.headers = {
      Metadata: true
    }

    webClient.sendRequest(webRequest).then(
      (response: webClient.WebResponse) => {
        if (response.statusCode === 200 && response.body) {
          const body = JSON.parse(response.body)
          deferred.resolve(body.access_token)
        } else if (response.statusCode === 429 || response.statusCode === 500) {
          if (retyCount < retryLimit) {
            const waitedTime = 2000 + timeToWait * 2
            retyCount += 1
            setTimeout(() => {
              deferred.resolve(
                this._getMSIAuthorizationToken(retyCount, waitedTime)
              )
            }, waitedTime)
          } else {
            deferred.reject(
              util.format(
                'Could not fetch access token for Managed Service Principal. Status code: %s, status message: %s',
                response.statusCode,
                response.statusMessage
              )
            )
          }
        } else {
          deferred.reject(
            util.format(
              "Could not fetch access token for Managed Service Principal. Please configure Managed Service Identity (MSI) for virtual machine 'https://aka.ms/azure-msi-docs'. Status code: %s, status message: %s",
              response.statusCode,
              response.statusMessage
            )
          )
        }
      },
      (error: Error) => {
        deferred.reject(error)
      }
    )

    return deferred.promise
  }

  private async _getSPNAuthorizationToken(): Promise<string> {
    if (
      this.authType ===
      constants.AzureServicePrinicipalAuthentications.servicePrincipalKey
    ) {
      return this._getSPNAuthorizationTokenFromKey()
    }

    return this._getSPNAuthorizationTokenFromCertificate()
  }

  private async _getSPNAuthorizationTokenFromCertificate(): Promise<string> {
    const deferred = Q.defer<string>()
    const webRequest = new webClient.WebRequest()
    webRequest.method = 'POST'
    webRequest.uri = `${this.authorityUrl +
      (this.isADFSEnabled ? '' : this.domain)}/oauth2/token/`
    webRequest.body = querystring.stringify({
      resource: this.activeDirectoryResourceId,
      // eslint-disable-next-line @typescript-eslint/camelcase
      client_id: this.clientId,
      // eslint-disable-next-line @typescript-eslint/camelcase
      grant_type: 'client_credentials',
      // eslint-disable-next-line @typescript-eslint/camelcase
      client_assertion: this._getSPNCertificateAuthorizationToken(),
      // eslint-disable-next-line @typescript-eslint/camelcase
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
    })

    const webRequestOptions: webClient.WebRequestOptions = {
      retriableErrorCodes: undefined,
      retriableStatusCodes: [400, 408, 409, 500, 502, 503, 504],
      retryCount: undefined,
      retryIntervalInSeconds: undefined,
      retryRequestTimedout: undefined
    }

    webClient.sendRequest(webRequest, webRequestOptions).then(
      (response: webClient.WebResponse) => {
        if (response.statusCode === 200 && response.body) {
          const body = JSON.parse(response.body)
          deferred.resolve(body.access_token)
        } else if ([400, 401, 403].includes(response.statusCode || 0)) {
          deferred.reject(
            'Could not fetch access token for Azure. Verify if the Service Principal used is valid and not expired. For more information refer https://aka.ms/azureappservicedeploytsg'
          )
        } else {
          deferred.reject(
            util.format(
              'Could not fetch access token for Azure. Status code: %s, status message: %s',
              response.statusCode,
              response.statusMessage
            )
          )
        }
      },
      (error: Error) => {
        deferred.reject(error)
      }
    )
    return deferred.promise
  }

  private async _getSPNAuthorizationTokenFromKey(): Promise<string> {
    const deferred = Q.defer<string>()
    const webRequest = new webClient.WebRequest()
    webRequest.method = 'POST'
    webRequest.uri = `${this.authorityUrl + this.domain}/oauth2/token/`
    webRequest.body = querystring.stringify({
      resource: this.activeDirectoryResourceId,
      // eslint-disable-next-line @typescript-eslint/camelcase
      client_id: this.clientId,
      // eslint-disable-next-line @typescript-eslint/camelcase
      grant_type: 'client_credentials',
      // eslint-disable-next-line @typescript-eslint/camelcase
      client_secret: this.secret
    })
    webRequest.headers = {
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
    }

    const webRequestOptions: webClient.WebRequestOptions = {
      retriableErrorCodes: undefined,
      retriableStatusCodes: [400, 403, 408, 409, 500, 502, 503, 504],
      retryCount: undefined,
      retryIntervalInSeconds: undefined,
      retryRequestTimedout: undefined
    }

    webClient.sendRequest(webRequest, webRequestOptions).then(
      (response: webClient.WebResponse) => {
        if (response.statusCode === 200 && response.body) {
          const body = JSON.parse(response.body)
          deferred.resolve(body.access_token)
        } else if ([400, 401, 403].includes(response.statusCode || 0)) {
          deferred.reject(
            'Could not fetch access token for Azure. Verify if the Service Principal used is valid and not expired. For more information refer https://aka.ms/azureappservicedeploytsg'
          )
        } else {
          deferred.reject(
            util.format(
              'Could not fetch access token for Azure. Status code: %s, status message: %s',
              response.statusCode,
              response.statusMessage
            )
          )
        }
      },
      (error: Error) => {
        deferred.reject(error)
      }
    )

    return deferred.promise
  }

  private _getSPNCertificateAuthorizationToken(): string {
    const openSSLPath = os.type().match(/^Win/)
      ? tl.which(path.join(__dirname, 'openssl', 'openssl'))
      : tl.which('openssl')
    const openSSLArgsArray = [
      'x509',
      '-noout',
      '-in',
      this.certFilePath || '',
      '-fingerprint'
    ]

    const pemExecutionResult = tl.execSync(openSSLPath, openSSLArgsArray)
    const additionalHeaders: IJWTHeaders = {
      alg: 'RS256',
      typ: 'JWT'
    }

    if (pemExecutionResult.code === 0) {
      core.debug('FINGERPRINT CREATION SUCCESSFUL')
      const shaFingerprint = pemExecutionResult.stdout
      const shaFingerPrintHashCode = shaFingerprint
        .split('=')[1]
        .replace(new RegExp(':', 'g'), '')
      const shaSegments = shaFingerPrintHashCode.match(/\w{2}/g)

      if (shaSegments) {
        const fingerPrintHashBase64: string = Buffer.from(
          shaSegments
            .map(function(a) {
              return String.fromCharCode(parseInt(a, 16))
            })
            .join(''),
          'binary'
        ).toString('base64')
        additionalHeaders['x5t'] = fingerPrintHashBase64
      }
    } else {
      core.info(pemExecutionResult?.code?.toString() || '')
      throw new Error(pemExecutionResult.stderr)
    }

    return getJWT(
      this.authorityUrl,
      this.clientId,
      this.domain,
      this.certFilePath || '',
      additionalHeaders,
      this.isADFSEnabled
    )
  }
}

function getJWT(
  url: string,
  clientId: string,
  tenantId: string,
  pemFilePath: string,
  additionalHeaders: IJWTHeaders,
  isADFSEnabled: boolean
): string {
  const pemFileContent = fs.readFileSync(pemFilePath)
  const jwtObject = {
    aud: `${url}/${!isADFSEnabled ? tenantId : ''}/oauth2/token`.replace(
      /([^:]\/)\/+/g,
      '$1'
    ),
    iss: clientId,
    sub: clientId,
    jti: Math.random(),
    nbf: Math.floor(Date.now() / 1000) - 1000,
    exp: Math.floor(Date.now() / 1000) + 8640000
  }

  const token = jwt.sign(jwtObject, pemFileContent, {
    algorithm: 'RS256',
    header: additionalHeaders
  })
  return token
}
