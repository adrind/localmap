const express = require('express');
const router = express.Router();

const exceltojson = require("xlsx-to-json-lc");
const request = require('request');
const fs = require('fs');
const cheerio = require('cheerio');
const INDEED_PUBLISHER_ID = '6870420585336022';

/*
 * Fetches data for Route 45 bus in Anchorage
 */
function getRouteData() {
    let data;
    return new Promise(function (resolve, reject) {
        exceltojson({
            input: "/Users/adrienne/workspace/localmap/public/routedata.xlsx",
            output: null,
            lowerCaseHeaders:true //to convert all excel headers to lower case in json
        }, function (err, result) {
            if(err) {
                reject(err)
            } else {
                data = result.map((r, i) => {
                    return {
                        id: i,
                        type: 'route',
                        attributes: r
                    }
                });
                resolve(data);
            }
        });
    });
}

/*
 * Runs a job query for Indeed.com
 */
function getIndeedJobs(query) {
    return new Promise(function (resolve, reject) {
        request(`http://api.indeed.com/ads/apisearch?publisher=${INDEED_PUBLISHER_ID}&v=2&q=${query}&l=anchorage%2C+ak&latlong=1&format=json&useragent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.76 Safari/537.36&userip=69.181.129.26&limit=100`, (err, response, body) => {
            if (!err && response.statusCode == 200) {
                const data = JSON.parse(body);
                const results = data.results.map((r, i) => {
                    return {
                        type: 'job',
                        id: i,
                        attributes: {
                            title: r.jobtitle,
                            company: r.company,
                            lat: r.latitude,
                            lng: r.longitude,
                            date: r.date,
                            url: r.url,
                            snippet: r.snippet,
                            'job-key': r.jobKey,
                            'relative-time': r.formattedRelativeTime
                        }
                    }
                });

                resolve(results);
            }
        })
    });
}

/*
 * Runs a job query from Career One Stop
 * Possible sources of jobs: US.jobs (DEA), CareerBuilder (AJE), or America's Job Exchange (CB)
 */

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

router.get('/jobs', function(req, res, next) {
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

    function renderResponse(data) {
        res.send({data});
    }

    if(source === 'IND') {
        //get jobs from indeed
        getIndeedJobs(keyword).then(renderResponse);
    } else {
        getGovJobs(options).then(renderResponse);
    }
});


router.get('/routes', function(req, res, next) {
    getRouteData().then((routes) => {
        res.send({data: routes})
    });
});


module.exports = router;
