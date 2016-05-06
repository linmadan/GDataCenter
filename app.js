'use strict';
var bearcat = require('bearcat');
var appEvent = require('./lib/application/appEvent');

var DataDispatch;
var DataRTMaster;
var MqttClient;
var contextPath = require.resolve('./bcontext.json');
bearcat.createApp([contextPath]);
bearcat.start(function () {
    DataDispatch = bearcat.getBean('dataDispatch');
    DataRTMaster = bearcat.getBean('dataRTMaster');
    MqttClient = bearcat.getBean('mqttClient');
    DataRTMaster.launch(function (err, cBData) {
        if (err) {
            return;
        }
        DataRTMaster.on(appEvent.application.STATION_OPEN_RTDATA, function (eventData) {
            MqttClient.publishStationStartRTDataMonitorResult(eventData);
            console.log(`station added:${JSON.stringify(eventData)}`);
        });
        DataRTMaster.on(appEvent.domain.RTDATAS_PUB, function (eventData) {
            MqttClient.publishStationPubRTData(eventData);
            console.log(`station pub rt data:${JSON.stringify(eventData)}`);
        });
    });
    DataDispatch.on(appEvent.application.DATA_POINT_SAVE_SUCCESS, function (eventData) {
        console.log(`data point added:${JSON.stringify(eventData)}`);
        DataRTMaster.receiveRTData(eventData);
    });
    MqttClient.on("DataArrive", function (data) {
        DataDispatch.receiveData(data);
    });
    MqttClient.on("StationStartRTDataMonitor", function (stationName) {
        DataRTMaster.stationStartRTDataMonitor(stationName, function (err, cBData) {
            if (err) {
                return;
            }
            MqttClient.publishStationStartRTDataMonitorResult(cBData);
        })
    });
    MqttClient.on("StationSetStationRTData", function (stationRTDataConfig) {
        DataRTMaster.setStationRTData(stationRTDataConfig, function (err, cBData) {
            if (err) {
                return;
            }
            DataRTMaster.stationStartRTDataMonitor(cBData.stationName, function (err, cBData) {
                if (err) {
                    return;
                }
                MqttClient.publishStationStartRTDataMonitorResult(cBData);
            })
        })
    });
    MqttClient.subscribeData();
    MqttClient.subscribeStationStartRTDataMonitor();
    MqttClient.subscribeStationSetStationRTData();
});