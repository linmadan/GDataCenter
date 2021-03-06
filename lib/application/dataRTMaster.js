'use strict';
var async = require('async');
var _ = require('underscore');
var util = require('util');
var EventEmitter = require('events');
var appEvent = require('./appEvent');
var appError = require('./appError');
var RTDataMasterCenter = require('../domain/rTDataMasterCenter');
var DataStation = require('../domain/dataStation');
var StationRTData = require('../domain/stationRTData');

function DataRTMaster() {
    EventEmitter.call(this);
    this.__rTDataMasterCenter__ = new RTDataMasterCenter();
    this.__stationRepository__ = null;
    this.__dataRepository__ = null;
};

util.inherits(DataRTMaster, EventEmitter);

DataRTMaster.prototype.launch = function (stationNames, callback) {
    var dD = this;
    var stationCount = 0;
    var rTDataCount = 0;
    async.waterfall([function (cb) {
        if (!_.isArray(stationNames) || stationNames.length == 0) {
            dD.__stationRepository__.getAllOpenRTDataStation(cb);
        }
        else {
            dD.__stationRepository__.getOpenRTDataStationForNames(stationNames, cb);
        }
    }], function (err, dataStations) {
        if (err) {
            callback(err, null);
            return;
        }
        if (dataStations.length == 0) {
            let cBevent = {};
            cBevent.stationCount = 0;
            cBevent.rTDataCount = 0;
            callback(null, cBevent);
            return;
        }
        for (let dataStation of dataStations) {
            if (!_.isUndefined(dataStation.rTDataConfigs)) {
                dD.__rTDataMasterCenter__.addStationRTData(dataStation);
                stationCount++;
            }
        }
        var currentDate = new Date();
        var rTdataFuns = [];
        for (let stationName of _.keys(dD.__rTDataMasterCenter__.stationRTDatas)) {
            for (let dataName of _.keys(dD.__rTDataMasterCenter__.stationRTDatas[stationName].rTDatas)) {
                rTdataFuns.push(function (cb) {
                    var sectionOptions = {
                        stationName: stationName,
                        dataName: dataName,
                        startD: new Date(currentDate.getTime() - (dD.__rTDataMasterCenter__.stationRTDatas[stationName].rTDatas[dataName].timeLong)),
                        endD: currentDate
                    };
                    dD.__dataRepository__.getDataSection(sectionOptions, cb);
                });
            }
        }
        async.parallel(rTdataFuns,
            function (err, results) {
                if (err) {
                    callback(err, null);
                    return;
                }
                for (let dataSection of results) {
                    dD.__rTDataMasterCenter__.loadRTDatas(dataSection);
                    rTDataCount++;
                }
                let cBevent = {};
                cBevent.stationCount = stationCount;
                cBevent.rTDataCount = rTDataCount;
                callback(null, cBevent);
            });
    });
};

DataRTMaster.prototype.launchStationRDM = function (stationName, callback) {
    var dD = this;
    var setStationRTData = function (stationName, scb) {
        async.waterfall([function (cb) {
            dD.__stationRepository__.getStationRDConfig(stationName, cb);
        }], function (err, rTDataConfigs) {
            if (err) {
                scb(err, null);
                return;
            }
            if (_.isNull(rTDataConfigs)) {
                let cBData = {};
                cBData.stationName = stationName;
                cBData.isLaunched = false;
                cBData.rTDataCount = 0;
                scb(null, cBData);
                return;
            }
            var stationRDConfig = {};
            stationRDConfig.stationName = stationName;
            stationRDConfig.rTDataConfigs = rTDataConfigs;
            dD.__rTDataMasterCenter__.setStationRTData(stationRDConfig);
            var currentDate = new Date();
            var rTdataFuns = [];
            for (let dataName of _.keys(dD.__rTDataMasterCenter__.stationRTDatas[stationName].rTDatas)) {
                rTdataFuns.push(function (cb) {
                    var sectionOptions = {
                        stationName: stationName,
                        dataName: dataName,
                        startD: new Date(currentDate.getTime() - (dD.__rTDataMasterCenter__.stationRTDatas[stationName].rTDatas[dataName].timeLong)),
                        endD: currentDate
                    };
                    dD.__dataRepository__.getDataSection(sectionOptions, cb);
                });
            }
            async.parallel(rTdataFuns,
                function (err, results) {
                    if (err) {
                        scb(err, null);
                        return;
                    }
                    var rTDataCount = 0;
                    for (let dataSection of results) {
                        if (dataSection.datas.length > 0) {
                            dD.__rTDataMasterCenter__.loadRTDatas(dataSection);
                        }
                        rTDataCount++;
                    }
                    let cBData = {};
                    cBData.stationName = stationName;
                    cBData.isLaunched = true;
                    cBData.rTDataCount = rTDataCount;
                    scb(null, cBData);
                });
        });
    };
    if (!_.has(dD.__rTDataMasterCenter__.stationRTDatas, stationName)) {
        var stationData = {};
        stationData.stationName = stationName;
        var dataStation = new DataStation(stationData);
        dD.__rTDataMasterCenter__.addStationRTData(new StationRTData(dataStation));
        let appEventData = {};
        appEventData.stationName = stationName;
        dD.emit(appEvent.application.STATION_OPEN_RTDATA, appEventData);
        setStationRTData(stationName, callback);
    }
    else {
        setStationRTData(stationName, callback);
    }
};

DataRTMaster.prototype.stationStartRTDataMonitor = function (stationName, callback) {
    var isOpen = _.has(this.__rTDataMasterCenter__.stationRTDatas, stationName);
    if (isOpen) {
        let cBData = {};
        cBData.stationName = stationName;
        cBData.startSuccess = true;
        cBData.rTdatas = {};
        for (let dataName of _.keys(this.__rTDataMasterCenter__.stationRTDatas[stationName].rTDatas)) {
            cBData.rTdatas[dataName] = this.__rTDataMasterCenter__.getRTDatas(stationName, dataName);
        }
        callback(null, cBData);
    }
    else {
        var dM = this;
        async.waterfall([function (cb) {
            dM.__dataRepository__.getStationDataNames(stationName, cb);
        }], function (err, dataNames) {
            if (err) {
                callback(err, null);
                return;
            }
            let cBData = {};
            cBData.stationName = stationName;
            cBData.startSuccess = false;
            cBData.rTdatas = {};
            for (let dataName of dataNames) {
                cBData.rTdatas[dataName] = {};
            }
            callback(null, cBData);
        });
    }
};

DataRTMaster.prototype.receiveRTData = function (dataPoint) {
    if (this.__rTDataMasterCenter__.isHaveRTData(dataPoint.stationName, dataPoint.dataName)) {
        this.__rTDataMasterCenter__.addRTData(dataPoint);
        if (this.__rTDataMasterCenter__.isCanPubRTDatas(dataPoint.stationName, dataPoint.dataName)) {
            let eventData = this.__rTDataMasterCenter__.pubRTDatas(dataPoint.stationName, dataPoint.dataName);
            this.emit(appEvent.domain.RTDATAS_PUB, eventData);
        }
    }
};

DataRTMaster.prototype.getRTData = function (stationName, dataName, callback) {
    if (!this.__rTDataMasterCenter__.isHaveRTData(stationName, dataName)) {
        callback(null, null);
        return;
    }
    var rTData = this.__rTDataMasterCenter__.getRTDatas(stationName, dataName);
    callback(null, rTData);
};

module.exports = DataRTMaster;
