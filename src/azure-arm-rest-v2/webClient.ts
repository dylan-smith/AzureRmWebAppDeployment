// import tl = require('azure-pipelines-task-lib/task');
// import util = require("util");
// import fs = require('fs');
// import httpClient = require("typed-rest-client/HttpClient");
// import httpInterfaces = require("typed-rest-client/Interfaces");

import * as tl from '../task-lib/task'
import * as httpClient from 'typed-rest-client/HttpClient'
import * as httpInterfaces from 'typed-rest-client/Interfaces'
import * as util from 'util'
import * as core from '@actions/core'
import {IncomingHttpHeaders} from 'http'

const proxyUrl: string | undefined = tl.getVariable('agent.proxyurl')
const requestOptions: httpInterfaces.IRequestOptions = proxyUrl
  ? {
      proxy: {
        proxyUrl,
        proxyUsername: tl.getVariable('agent.proxyusername'),
        proxyPassword: tl.getVariable('agent.proxypassword'),
        proxyBypassHosts: tl.getVariable('agent.proxybypasslist')
          ? JSON.parse(tl.getVariable('agent.proxybypasslist') || '')
          : null
      }
    }
  : {}

const ignoreSslErrors: string =
  tl.getVariable('VSTS_ARM_REST_IGNORE_SSL_ERRORS') || ''
if (ignoreSslErrors) {
  requestOptions.ignoreSslError = ignoreSslErrors.toLowerCase() === 'true'
}

const httpCallbackClient = new httpClient.HttpClient(
  tl.getVariable('AZURE_HTTP_USER_AGENT'),
  undefined,
  requestOptions
)

export class WebRequest {
  method?: string
  uri?: string
  // body can be string or ReadableStream
  body?: string | NodeJS.ReadableStream
  headers?: httpInterfaces.IHeaders
}

export class WebResponse {
  statusCode?: number
  statusMessage?: string
  headers?: IncomingHttpHeaders
  body?: string
}

export class WebRequestOptions {
  retriableErrorCodes?: string[]
  retryCount?: number
  retryIntervalInSeconds?: number
  retriableStatusCodes?: number[]
  retryRequestTimedout?: boolean
}

export async function sendRequest(
  request: WebRequest,
  options?: WebRequestOptions
): Promise<WebResponse> {
  let i = 0
  const retryCount = options && options.retryCount ? options.retryCount : 5
  const retryIntervalInSeconds =
    options && options.retryIntervalInSeconds
      ? options.retryIntervalInSeconds
      : 2
  const retriableErrorCodes =
    options && options.retriableErrorCodes
      ? options.retriableErrorCodes
      : [
          'ETIMEDOUT',
          'ECONNRESET',
          'ENOTFOUND',
          'ESOCKETTIMEDOUT',
          'ECONNREFUSED',
          'EHOSTUNREACH',
          'EPIPE',
          'EA_AGAIN'
        ]
  const retriableStatusCodes =
    options && options.retriableStatusCodes
      ? options.retriableStatusCodes
      : [408, 409, 500, 502, 503, 504]
  let timeToWait: number = retryIntervalInSeconds
  for (;;) {
    try {
      // path is not a property defined in the TypeScript type for NodeJS.ReadableStream so commenting this bit out
      // if (request.body && typeof (request.body) !== 'string' && !request.body["readable"]) {
      //     request.body = fs.createReadStream(request.body["path"]);
      // }

      const response: WebResponse = await sendRequestInternal(request)
      if (
        response.statusCode &&
        retriableStatusCodes.includes(response.statusCode) &&
        ++i < retryCount
      ) {
        core.debug(
          util.format(
            "Encountered a retriable status code: %s. Message: '%s'.",
            response.statusCode,
            response.statusMessage
          )
        )
        await sleepFor(timeToWait)
        timeToWait =
          timeToWait * retryIntervalInSeconds + retryIntervalInSeconds
        continue
      }

      return response
    } catch (error) {
      if (retriableErrorCodes.includes(error.code) && ++i < retryCount) {
        core.debug(
          util.format(
            'Encountered a retriable error:%s. Message: %s.',
            error.code,
            error.message
          )
        )
        await sleepFor(timeToWait)
        timeToWait =
          timeToWait * retryIntervalInSeconds + retryIntervalInSeconds
      } else {
        if (error.code) {
          core.error(`error;code=${error.code}`)
        }

        throw error
      }
    }
  }
}

export async function sleepFor(sleepDurationInSeconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, sleepDurationInSeconds * 1000)
  })
}

async function sendRequestInternal(request: WebRequest): Promise<WebResponse> {
  core.debug(util.format('[%s]%s', request.method, request.uri))
  const response: httpClient.HttpClientResponse = await httpCallbackClient.request(
    request.method || '',
    request.uri || '',
    request.body || '',
    request.headers || {}
  )
  return await toWebResponse(response)
}

async function toWebResponse(
  response: httpClient.HttpClientResponse
): Promise<WebResponse> {
  const res = new WebResponse()
  if (response) {
    res.statusCode = response.message.statusCode
    res.statusMessage = response.message.statusMessage
    res.headers = response.message.headers
    res.body = await response.readBody()
  }

  return res
}
