const express = require('express');
const router = express.Router();
const exceltojson = require("xlsx-to-json-lc");

const NodeGeocoder = require('node-geocoder');
const options = {
    provider: 'google',

    httpAdapter: 'https', // Default
    apiKey: 'AIzaSyAXUr341XG_Hgyz2_KdAQKuju3tm-p6gMQ', // for Mapquest, OpenCage, Google Premier
    formatter: null         // 'gpx', 'string', ...
};
const geocoder = NodeGeocoder(options);

function getRouteData() {
    return new Promise(function (resolve, reject) {
        exceltojson({
            input: "/Users/adrienne/workspace/localmap/public/route.xlsx",
            output: null,
            lowerCaseHeaders:true //to convert all excel headers to lower case in json
        }, function (err, result) {
            if(err) {
                reject(err)
            } else {
                resolve(result);
            }
        });
    });
}

function getGeoData(jobs, res, routeData) {
    const toTranslate = jobs.map((job) => {return `${job.address} Anchorage Alaska`}).concat(routeData.map((route) => {return `${route.location} Anchorage Alaska`})),
          routeIndex = jobs.length;
    geocoder.batchGeocode(toTranslate).then((latLngResults) => {
        latLngResults.map((result, i) => {
            if(i < routeIndex) {
                if(jobs[i] && result.error === null) {
                    if(result.value.length) {
                        result = result.value[0]
                    }

                    jobs[i]['latitude'] = result.latitude;
                    jobs[i]['longitude'] = result.longitude;
                }
            } else {
                if(routeData[i - routeIndex] && result.error === null) {
                    if(result.value.length) {
                        result = result.value[0]
                    }

                    routeData[i - routeIndex]['latitude'] = result.latitude;
                    routeData[i - routeIndex]['longitude'] = result.longitude;
                }
            }
        });

        res.send({businesses: jobs, route: routeData});
    });
}

/* GET home page. */
router.get('/businesses', function(req, res, next) {
    let data;

    exceltojson({
        input: "/Users/adrienne/workspace/localmap/public/jobs.xlsx",
        output: null,
        lowerCaseHeaders:true //to convert all excel headers to lower case in json
    }, function(err, result) {
        if(err) {
            console.error(err);
            res.send({err});
        } else {
            data = result.map((datum, i) => {

                datum.name = datum['business name'];
                datum.id = i;

                delete datum['business name'];
                //removes annoying empty col
                delete datum[''];

                return datum
            });

            getRouteData().then((routeData) => {
                getGeoData(data, res, routeData);
            });
        }
    });

});

module.exports = router;
