const express = require('express');
const router = express.Router();
const exceltojson = require("xlsx-to-json-lc");
const request = require('request');
const json2xls = require('json2xls');
const fs = require('fs');
const cheerio = require('cheerio');

const NodeGeocoder = require('node-geocoder');
const geoOptions = {
    provider: 'google',

    httpAdapter: 'https', // Default
    apiKey: 'AIzaSyAXUr341XG_Hgyz2_KdAQKuju3tm-p6gMQ', // for Mapquest, OpenCage, Google Premier
    formatter: null         // 'gpx', 'string', ...
};
const geocoder = NodeGeocoder(geoOptions);


const INDEED_PUBLISHER_ID = '6870420585336022';

function getRouteData() {
    return new Promise(function (resolve, reject) {
        exceltojson({
            input: "/Users/adrienne/workspace/localmap/public/routedata.xlsx",
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

function getIndeedJobs(query) {
    return new Promise(function (resolve, reject) {
        request(`http://api.indeed.com/ads/apisearch?publisher=${INDEED_PUBLISHER_ID}&v=2&q=${query}&l=anchorage%2C+ak&latlong=1&format=json&useragent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.76 Safari/537.36&userip=69.181.129.26&limit=100`, (err, response, body) => {
            if (!err && response.statusCode == 200) {
                const data = JSON.parse(body);
                const results = data.results.map((r, i) => {
                    return {
                        id: i,
                        title: r.jobtitle,
                        company: r.company,
                        lat: r.latitude,
                        lng: r.longitude,
                        date: r.date,
                        url: r.url,
                        snippet: r.snippet,
                        jobKey: r.jobKey,
                        relativeTime: r.formattedRelativeTime
                    }
                });

                resolve(data);
            }
        })
    });
}

function getGovJobs(options) {
    return new Promise(function (resolve, reject) {
        request(options, (err, response, body) => {
            const data = [];
            if (!err && response.statusCode == 200) {
                const $ = cheerio.load(body);
                const table = $('tr, .res-table');

                table.each((i, tr) => {
                    const $tr = $(tr);

                    data.push({
                        type: 'us-gov-job',
                        id: i,
                        attributes: {
                            'url': $tr.find('[data-title="Job Title"] a').attr('href'),
                            'title': $tr.find('[data-title="Job Title"] a').html(),
                            'company': $tr.find('[data-title="Company"]').html(),
                            'location': $tr.find('[data-title="Location"]').html(),
                            'date': $tr.find('[data-title="Date Posted"]').html()
                        }
                    })
                });

            }

            resolve(data);
        });
    });
}

function getGeoData(jobs, res, routeData) {
    const toTranslate = jobs.map((job) => {return `${job.address} Anchorage Alaska `}).concat(routeData.map((route) => {return `${route.location} Anchorage, AK 99508`})),
          routeIndex = jobs.length;
    geocoder.batchGeocode(toTranslate).then((latLngResults) => {
        latLngResults.map((result, i) => {
            if(i < routeIndex) {
                //update jobs
                if(jobs[i] && result.error === null) {
                    if(result.value.length) {
                        result = result.value[0]
                    }

                    jobs[i]['latitude'] = result.latitude;
                    jobs[i]['longitude'] = result.longitude;
                }
            } else {
                //update route data with lat lng
                if(routeData[i - routeIndex] && result.error === null) {
                    if(result.value.length) {
                        result = result.value[0]
                    }

                    routeData[i - routeIndex]['latitude'] = result.latitude;
                    routeData[i - routeIndex]['longitude'] = result.longitude;
                }
            }
        });

        const xls = json2xls(routeData);
        fs.writeFileSync('routedata.xlsx', xls, 'binary');

        res.send({businesses: jobs, route: routeData});
    });
}

router.get('/govJobs', function(req, res, next) {
    const keyword = req.query.q || 'jobs',
          pageSize = req.query.page || '25',
          location = 'Anchorage, AK',
          source = req.query.source || 'DEA';

    const options = {
        url: `https://www.careeronestop.org/toolkit/jobs/find-jobs.aspx?keyword=${keyword}&location=${location}&source=${source}&pagesize=${pageSize}`,
        headers: {
            'Upgrade-Insecure-Requests':'1',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.76 Safari/537.36',
        }
    };

    if(source === 'IND') {
        getIndeedJobs(keyword).then((data) => {
            res.send({data});
        })
    } else {
        getGovJobs(options).then((data) => {
            res.send({data});
        })
    }
});


router.get('/routes', function(req, res, next) {
    getRouteData().then((routes) => {
        res.send({routes: routes})
    });
});


module.exports = router;
