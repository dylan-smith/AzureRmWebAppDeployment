//import tl = require('azure-pipelines-task-lib/task');
//import path = require('path');
//import Q = require('q');
//import fs = require('fs');

import * as utility from './ActionUtility'
import * as Q from 'q'
import * as core from '@actions/core'
import * as path from 'path'
import * as fs from 'fs'
import * as DecompressZip from 'decompress-zip'
import * as archiver from 'archiver'

//var DecompressZip = require('decompress-zip');
//var archiver = require('archiver');

export async function unzip(
  zipLocation: string,
  unzipLocation: string
): Promise<string> {
  const defer = Q.defer<string>()
  if (utility.exist(unzipLocation)) {
    utility.rmRF(unzipLocation)
  }
  const unzipper = new DecompressZip(zipLocation)
  core.debug(`extracting ${zipLocation} to ${unzipLocation}`)
  unzipper.on('error', function(error: Error) {
    defer.reject(error)
  })
  unzipper.on('extract', function() {
    core.debug(`extracted ${zipLocation} to ${unzipLocation} Successfully`)
    defer.resolve(unzipLocation)
  })
  unzipper.extract({
    path: unzipLocation
  })
  return defer.promise
}

export async function archiveFolder(
  folderPath: string,
  targetPath: string,
  zipName: string
): Promise<string> {
  const defer = Q.defer<string>()
  core.debug(`Archiving ${folderPath} to ${zipName}`)
  const outputZipPath = path.join(targetPath, zipName)
  const output = fs.createWriteStream(outputZipPath)
  const archive = archiver('zip')
  output.on('close', function() {
    core.debug(`Successfully created archive ${zipName}`)
    defer.resolve(outputZipPath)
  })

  output.on('error', function(error) {
    defer.reject(error)
  })

  archive.pipe(output)
  archive.directory(folderPath, '/')
  archive.finalize()

  return defer.promise
}

export interface ArchivedEntries {
  entries: string[]
}

/**
 *  Returns array of files present in archived package
 */
export async function getArchivedEntries(
  archivedPackage: string
): Promise<ArchivedEntries> {
  const deferred: Q.Deferred<ArchivedEntries> = Q.defer()
  const unzipper = new DecompressZip(archivedPackage)
  unzipper.on('error', function(error: Error) {
    deferred.reject(error)
  })
  unzipper.on('list', function(files: string[]) {
    const packageComponent: ArchivedEntries = {
      entries: files
    }
    deferred.resolve(packageComponent)
  })
  unzipper.list()
  return deferred.promise
}
