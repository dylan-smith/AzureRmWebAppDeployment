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

export async function unzip(zipLocation: string, unzipLocation: string) {
  var defer = Q.defer()
  if (utility.exist(unzipLocation)) {
    utility.rmRF(unzipLocation)
  }
  var unzipper = new DecompressZip(zipLocation)
  core.debug('extracting ' + zipLocation + ' to ' + unzipLocation)
  unzipper.on('error', function(error: any) {
    defer.reject(error)
  })
  unzipper.on('extract', function() {
    core.debug(
      'extracted ' + zipLocation + ' to ' + unzipLocation + ' Successfully'
    )
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
) {
  var defer = Q.defer()
  core.debug('Archiving ' + folderPath + ' to ' + zipName)
  var outputZipPath = path.join(targetPath, zipName)
  var output = fs.createWriteStream(outputZipPath)
  var archive = archiver('zip')
  output.on('close', function() {
    core.debug('Successfully created archive ' + zipName)
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
  entries: any
}

/**
 *  Returns array of files present in archived package
 */
export async function getArchivedEntries(
  archivedPackage: string
): Promise<ArchivedEntries> {
  var deferred: Q.Deferred<ArchivedEntries> = Q.defer()
  var unzipper = new DecompressZip(archivedPackage)
  unzipper.on('error', function(error: any) {
    deferred.reject(error)
  })
  unzipper.on('list', function(files: any) {
    var packageComponent: ArchivedEntries = {
      entries: files
    }
    deferred.resolve(packageComponent)
  })
  unzipper.list()
  return deferred.promise
}
