'use strict'

var extend = require('extend')
var find = require('lodash.find')
var AWS = require('aws-sdk')
var baseParams = {
  ChangeBatch: {
    Changes: [],
    Comment: ''
  }
}

var createChange = function createChange (type, baseDomain, subDomainName) {
  type = type || 'CREATE'

  if (arguments.length === 2) {
    subDomainName = baseDomain
    baseDomain = type
    type = 'CREATE'
  } else {
    type = type.toUpperCase()
  }

  return {
    Action: type,
    ResourceRecordSet: {
      Name: subDomainName + '.' + baseDomain,
      Type: 'CNAME',
      ResourceRecords: [
        {
          Value: baseDomain
        }
      ],
      TTL: 3600
    }
  }
}

var verboseId = function () {
  if (!verboseId) {
    return
  }

  var split = verboseId.split('/')

  return split.slice(-1)[0]
}

var splitDomain = function (domain) {
  var newDomainSplit = domain.split('.')
  var baseDomain = newDomainSplit.slice(1).join('.')
  var subDomain = newDomainSplit[0]
  var rootDomain = newDomainSplit.slice(-2).join('.')

  return {
    root: rootDomain,
    base: baseDomain,
    sub: subDomain
  }
}

var splitZoneId = function (verboseId) {
  if (!verboseId) {
    return
  }

  var split = verboseId.split('/')

  return split.slice(-1)[0]
}

function App (options) {
  if (!(this instanceof App)) {
    return new App(options)
  }

  options = options || {}

  if (!options.accessKeyId || !options.secretAccessKey) {
    throw new Error('Invalid options specified; `accessKeyId` and `secretAccessKey` are required.')
  }

  this.api = new AWS.Route53({
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey
  })
}

App.prototype.create = function (newDomain, callback) {
  var api = this.api
  var domainDetails = splitDomain(newDomain)
  var params = extend({}, baseParams)
  var rootDomain = domainDetails.root
  var baseDomain = domainDetails.base
  var subDomain = domainDetails.sub

  this._getHostedZoneId(rootDomain, function (err, id) {
    if (err) {
      return callback(err)
    }

    var change = createChange('create', baseDomain, subDomain)

    params.HostedZoneId = id
    params.ChangeBatch.Changes = [change]
    params.ChangeBatch.Comment = 'create domain: ' + subDomain + '.' + baseDomain

    api.changeResourceRecordSets(params, callback)
  })
}

App.prototype.delete = function (existingDomain, callback) {
  var api = this.api
  var domainDetails = splitDomain(existingDomain)
  var params = extend({}, baseParams)
  var rootDomain = domainDetails.root
  var baseDomain = domainDetails.base
  var subDomain = domainDetails.sub

  this._getHostedZoneId(rootDomain, function (err, id) {
    if (err) {
      return callback(err)
    }

    var change = createChange('delete', baseDomain, subDomain)

    params.HostedZoneId = id
    params.ChangeBatch.Changes = [change]
    params.ChangeBatch.Comment = 'delete domain: ' + subDomain + '.' + baseDomain

    api.changeResourceRecordSets(params, callback)
  })
}

App.prototype._getHostedZoneId = function (domain, callback, nextMarker) {
  var options = {}

  if (nextMarker) {
    options.Marker = nextMarker
  }

  this.api.listHostedZones(options, function (err, data) {
    if (err) {
      return callback(err)
    }

    if (data && data.HostedZones) {
      var result = find(data.HostedZones, function (item) {
        return item.Name === domain + '.'
      })

      if (result) {
        callback(undefined, splitZoneId(result.Id))
      } else if (!result && data.IsTruncated && data.NextMarker) {
        getHostedZoneId(domain, callback, data.NextMarker)
      } else {
        callback()
      }
    }
  })
}

module.exports = App
