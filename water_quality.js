document.addEventListener('DOMContentLoaded', async function () {
    // Display the loading indicator for water quality alarm
    const loadingIndicator = document.getElementById('loading_alarm_water_quality');
    loadingIndicator.style.display = 'block'; // Show the loading indicator

    // Set the category and base URL for API calls
    let setCategory = "Alarm-Water-Quality";

    let setBaseUrl = null;
    if (cda === "internal") {
        setBaseUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/`;
        console.log("setBaseUrl: ", setBaseUrl);
    } else if (cda === "public") {
        setBaseUrl = `https://cwms-data.usace.army.mil/cwms-data/`;
        console.log("setBaseUrl: ", setBaseUrl);
    }

    // Define the URL to fetch location groups based on category
    const categoryApiUrl = setBaseUrl + `location/group?office=${office}&include-assigned=false&location-category-like=${setCategory}`;
    console.log("categoryApiUrl: ", categoryApiUrl);

    // Initialize maps to store metadata and time-series ID (TSID) data for various parameters
    const metadataMap = new Map();
    const ownerMap = new Map();
    const tsidTempWaterMap = new Map();
    const tsidDepthMap = new Map();
    const tsidDoMap = new Map();

    // Initialize arrays for storing promises
    const metadataPromises = [];
    const ownerPromises = [];
    const tempWaterTsidPromises = [];
    const depthTsidPromises = [];
    const doTsidPromises = [];

    // Get the current date and time, and compute a "look-back" time for historical data
    const currentDateTime = new Date();
    const lookBackHours = subtractHoursFromDate(new Date(), 25); // Subtract 12 hours from the current time

    // Fetch location group data from the API
    fetch(categoryApiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data) || data.length === 0) {
                console.warn('No data available from the initial fetch.');
                return;
            }

            // Filter and map the returned data to basins belonging to the target category
            const targetCategory = { "office-id": office, "id": setCategory };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map(item => item.id);

            if (basins.length === 0) {
                console.warn('No basins found for the given category.');
                return;
            }

            // Initialize an array to store promises for fetching basin data
            const apiPromises = [];
            const combinedData = [];

            // Loop through each basin and fetch data for its assigned locations
            basins.forEach(basin => {
                const basinApiUrl = setBaseUrl + `location/group/${basin}?office=${office}&category-id=${setCategory}`;
                console.log("basinApiUrl: ", basinApiUrl);

                apiPromises.push(
                    fetch(basinApiUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Network response was not ok for basin ${basin}: ${response.statusText}`);
                            }
                            return response.json();
                        })
                        .then(getBasin => {
                            console.log('getBasin:', getBasin);

                            if (!getBasin) {
                                console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            // Filter and sort assigned locations based on 'attribute' field
                            getBasin[`assigned-locations`] = getBasin[`assigned-locations`].filter(location => location.attribute <= 900);
                            getBasin[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(getBasin);

                            // If assigned locations exist, fetch metadata and time-series data
                            if (getBasin['assigned-locations']) {
                                getBasin['assigned-locations'].forEach(loc => {
                                    console.log(loc['location-id']);

                                    // Fetch metadata for each location
                                    const locApiUrl = setBaseUrl + `locations/${loc['location-id']}?office=${office}`;
                                    console.log("locApiUrl: ", locApiUrl);
                                    metadataPromises.push(
                                        fetch(locApiUrl)
                                            .then(response => {
                                                if (response.status === 404) {
                                                    console.warn(`Location metadata not found for location: ${loc['location-id']}`);
                                                    return null; // Skip if not found
                                                }
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(locData => {
                                                if (locData) {
                                                    metadataMap.set(loc['location-id'], locData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for location ${loc['location-id']}:`, error);
                                            })
                                    );

                                    // Fetch owner for each location
                                    let ownerApiUrl = setBaseUrl + `location/group/${office}?office=${office}&category-id=${office}`;
                                    if (ownerApiUrl) {
                                        ownerPromises.push(
                                            fetch(ownerApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        console.warn(`Temp-Water TSID data not found for location: ${loc['location-id']}`);
                                                        return null;
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(ownerData => {
                                                    if (ownerData) {
                                                        console.log("ownerData", ownerData);
                                                        ownerMap.set(loc['location-id'], ownerData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${ownerApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    // Fetch temperature water TSID data
                                    const tsidTempWaterApiUrl = setBaseUrl + `timeseries/group/Temp-Water?office=${office}&category-id=${loc['location-id']}`;
                                    console.log("tsidTempWaterApiUrl: ", tsidTempWaterApiUrl);
                                    tempWaterTsidPromises.push(
                                        fetch(tsidTempWaterApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidTempWaterData => {
                                                // console.log('tsidTempWaterData:', tsidTempWaterData);
                                                if (tsidTempWaterData) {
                                                    tsidTempWaterMap.set(loc['location-id'], tsidTempWaterData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidTempWaterApiUrl}:`, error);
                                            })
                                    );

                                    // Fetch depth TSID data
                                    const tsidDepthApiUrl = setBaseUrl + `timeseries/group/Depth?office=${office}&category-id=${loc['location-id']}`;
                                    console.log("tsidDepthApiUrl: ", tsidDepthApiUrl);
                                    depthTsidPromises.push(
                                        fetch(tsidDepthApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidDepthData => {
                                                // console.log('tsidDepthData:', tsidDepthData);
                                                if (tsidDepthData) {
                                                    tsidDepthMap.set(loc['location-id'], tsidDepthData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidDepthApiUrl}:`, error);
                                            })
                                    );

                                    // Fetch dissolved oxygen TSID data
                                    const tsidDoApiUrl = setBaseUrl + `timeseries/group/Conc-DO?office=${office}&category-id=${loc['location-id']}`;
                                    console.log('tsidDoApiUrl:', tsidDoApiUrl);
                                    doTsidPromises.push(
                                        fetch(tsidDoApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidDoData => {
                                                // console.log('tsidDoData:', tsidDoData);
                                                if (tsidDoData) {
                                                    tsidDoMap.set(loc['location-id'], tsidDoData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidDoApiUrl}:`, error);
                                            })
                                    );
                                });
                            }
                        })
                        .catch(error => {
                            console.error(`Problem with the fetch operation for basin ${basin}:`, error);
                        })
                );
            });

            // Process all the API calls and store the fetched data
            Promise.all(apiPromises)
                .then(() => Promise.all(metadataPromises))
                .then(() => Promise.all(ownerPromises))
                .then(() => Promise.all(tempWaterTsidPromises))
                .then(() => Promise.all(depthTsidPromises))
                .then(() => Promise.all(doTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                // Add metadata, TSID, and last-value data to the location object

                                // Add metadata to json
                                const metadataMapData = metadataMap.get(loc['location-id']);
                                if (metadataMapData) {
                                    loc['metadata'] = metadataMapData;
                                }

                                // Add owner to json
                                const ownerMapData = ownerMap.get(loc['location-id']);
                                if (ownerMapData) {
                                    loc['owner'] = ownerMapData;
                                }

                                // Add temp-water to json
                                const tsidTempWaterMapData = tsidTempWaterMap.get(loc['location-id']);
                                if (tsidTempWaterMapData) {
                                    reorderByAttribute(tsidTempWaterMapData);
                                    loc['tsid-temp-water'] = tsidTempWaterMapData;
                                } else {
                                    loc['tsid-temp-water'] = null;  // Append null if missing
                                }

                                // Add depth to json
                                const tsidDepthMapData = tsidDepthMap.get(loc['location-id']);
                                if (tsidDepthMapData) {
                                    reorderByAttribute(tsidDepthMapData);
                                    loc['tsid-depth'] = tsidDepthMapData;
                                } else {
                                    loc['tsid-depth'] = null;  // Append null if missing
                                }

                                // Add do to json
                                const tsidDoMapData = tsidDoMap.get(loc['location-id']);
                                if (tsidDoMapData) {
                                    reorderByAttribute(tsidDoMapData);
                                    loc['tsid-do'] = tsidDoMapData;
                                } else {
                                    loc['tsid-do'] = null;  // Append null if missing
                                }

                                // Initialize empty arrays to hold API and last-value data for various parameters
                                loc['temp-water-api-data'] = [];
                                loc['temp-water-last-value'] = [];
                                loc['temp-water-min-value'] = [];
                                loc['temp-water-max-value'] = [];

                                loc['depth-api-data'] = [];
                                loc['depth-last-value'] = [];
                                loc['depth-min-value'] = [];
                                loc['depth-max-value'] = [];

                                loc['do-api-data'] = [];
                                loc['do-last-value'] = [];
                                loc['do-min-value'] = [];
                                loc['do-max-value'] = [];
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    const timeSeriesDataPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature, depth, and DO time series
                            const tempTimeSeries = locData['tsid-temp-water']?.['assigned-time-series'] || [];
                            const depthTimeSeries = locData['tsid-depth']?.['assigned-time-series'] || [];
                            const doTimeSeries = locData['tsid-do']?.['assigned-time-series'] || [];

                            // Function to create fetch promises for time series data
                            const timeSeriesDataFetchPromises = (timeSeries, type) => {
                                return timeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    const timeSeriesDataApiUrl = setBaseUrl + `timeseries?name=${tsid}&begin=${lookBackHours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;
                                    console.log('timeSeriesDataApiUrl:', timeSeriesDataApiUrl);

                                    return fetch(timeSeriesDataApiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    })
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.values) {
                                                data.values.forEach(entry => {
                                                    entry[0] = formatISODate2ReadableDate(entry[0]);
                                                });
                                            }

                                            // api Key
                                            let apiDataKey;
                                            if (type === 'temp-water') {
                                                apiDataKey = 'temp-water-api-data';
                                            } else if (type === 'depth') {
                                                apiDataKey = 'depth-api-data';
                                            } else if (type === 'do') {
                                                apiDataKey = 'do-api-data';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }
                                            locData[apiDataKey].push(data);

                                            // minValue Key
                                            let minValueKey;
                                            if (type === 'temp-water') {
                                                minValueKey = 'temp-water-min-value';
                                            } else if (type === 'depth') {
                                                minValueKey = 'depth-min-value';
                                            } else if (type === 'do') {
                                                minValueKey = 'do-min-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }
                                            if (!locData[minValueKey]) {
                                                locData[minValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // lastValue Key
                                            let lastValueKey;
                                            if (type === 'temp-water') {
                                                lastValueKey = 'temp-water-last-value';
                                            } else if (type === 'depth') {
                                                lastValueKey = 'depth-last-value';
                                            } else if (type === 'do') {
                                                lastValueKey = 'do-last-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }
                                            if (!locData[lastValueKey]) {
                                                locData[lastValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // maxValue Key
                                            let maxValueKey;
                                            if (type === 'temp-water') {
                                                maxValueKey = 'temp-water-max-value';
                                            } else if (type === 'depth') {
                                                maxValueKey = 'depth-max-value';
                                            } else if (type === 'do') {
                                                maxValueKey = 'do-max-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }
                                            if (!locData[maxValueKey]) {
                                                locData[maxValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // Get and store the last non-null value for the specific tsid
                                            const lastValue = getLastNonNullValue(data, tsid);
                                            // console.log("lastValue: ", lastValue);

                                            // Get and store the min non-null value for the specific tsid
                                            const minValue = getMinValue(data, tsid);
                                            // console.log("minValue: ", minValue);

                                            // Get and store the max non-null value for the specific tsid
                                            const maxValue = getMaxValue(data, tsid);
                                            // console.log("maxValue: ", maxValue);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[lastValueKey].push(lastValue);

                                            // Push an empty array [] if minValue is null, otherwise push the actual minValue
                                            if (minValue) {
                                                locData[minValueKey].push(minValue);
                                            }

                                            // Push an empty array [] if minValue is null, otherwise push the actual minValue
                                            if (maxValue) {
                                                locData[maxValueKey].push(maxValue);
                                            }
                                        })
                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };

                            // Create promises for temperature, depth, and DO time series
                            const tempPromises = timeSeriesDataFetchPromises(tempTimeSeries, 'temp-water');
                            const depthPromises = timeSeriesDataFetchPromises(depthTimeSeries, 'depth');
                            const doPromises = timeSeriesDataFetchPromises(doTimeSeries, 'do');

                            // Additional API call for extents data
                            const timeSeriesDataExtentsApiCall = (type) => {
                                const extentsApiUrl = setBaseUrl + `catalog/TIMESERIES?page-size=5000&office=${office}`;
                                console.log('extentsApiUrl:', extentsApiUrl);

                                return fetch(extentsApiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    }
                                })
                                    .then(res => res.json())
                                    .then(data => {
                                        locData['extents-api-data'] = data;
                                        locData[`extents-data`] = {}

                                        // Collect TSIDs from temp, depth, and DO time series
                                        const tempTids = tempTimeSeries.map(series => series['timeseries-id']);
                                        const depthTids = depthTimeSeries.map(series => series['timeseries-id']);
                                        const doTids = doTimeSeries.map(series => series['timeseries-id']);
                                        const allTids = [...tempTids, ...depthTids, ...doTids]; // Combine both arrays

                                        // Iterate over all TSIDs and create extents data entries
                                        allTids.forEach((tsid, index) => {
                                            // console.log("tsid:", tsid);
                                            const matchingEntry = data.entries.find(entry => entry['name'] === tsid);
                                            if (matchingEntry) {
                                                // Construct dynamic key
                                                let _data = {
                                                    office: matchingEntry.office,
                                                    name: matchingEntry.name,
                                                    earliestTime: matchingEntry.extents[0]?.['earliest-time'],
                                                    lastUpdate: matchingEntry.extents[0]?.['last-update'],
                                                    latestTime: matchingEntry.extents[0]?.['latest-time'],
                                                    tsid: matchingEntry['timeseries-id'], // Include TSID for clarity
                                                };
                                                // console.log({ locData })
                                                // Determine extent key based on tsid
                                                let extent_key;
                                                if (tsid.includes('Depth')) {
                                                    extent_key = 'depth';
                                                } else if (tsid.includes('Temp-Water')) { // Example for another condition
                                                    extent_key = 'temp-water';
                                                } else if (tsid.includes('Conc-DO')) { // Example for another condition
                                                    extent_key = 'do';
                                                } else {
                                                    return; // Ignore if it doesn't match either condition
                                                }
                                                // locData['tsid-extens-data']['temp-water'][0]
                                                if (!locData[`extents-data`][extent_key])
                                                    locData[`extents-data`][extent_key] = [_data]
                                                else
                                                    locData[`extents-data`][extent_key].push(_data)

                                            } else {
                                                console.warn(`No matching entry found for TSID: ${tsid}`);
                                            }
                                        });
                                    })
                                    .catch(error => {
                                        console.error(`Error fetching additional data for location ${locData['location-id']}:`, error);
                                    });
                            };

                            // Combine all promises for this location
                            timeSeriesDataPromises.push(Promise.all([...tempPromises, ...depthPromises, ...doPromises, timeSeriesDataExtentsApiCall()]));
                        }
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(timeSeriesDataPromises);

                })
                .then(() => {
                    console.log('All combinedData data fetched successfully:', combinedData);

                    // Check and remove all attribute ending in 0.1
                    combinedData.forEach((dataObj, index) => {
                        // console.log(`Processing dataObj at index ${index}:`, dataObj[`assigned-locations`]);

                        // Filter out locations where the 'attribute' ends with '.1'
                        dataObj[`assigned-locations`] = dataObj[`assigned-locations`].filter(location => {
                            const attribute = location[`attribute`].toString();
                            // console.log(`Checking attribute: ${attribute}`);
                            return !attribute.endsWith('.1');
                        });

                        // console.log(`Updated assigned-locations for index ${index}:`, dataObj[`assigned-locations`]);
                    });

                    console.log('All combinedData data filtered successfully:', combinedData);


                    // Check if there are valid lastDatmanValues in the data
                    if (hasLastValue(combinedData)) {
                        console.log("Last value detected for all entries. calling hasDataSpike");
                        if (hasDataSpike(combinedData)) {
                            console.log("Data spike detected. calling createTableDataSpike");
                            // call createTable if data spike exists
                            const table = createTableDataSpike(combinedData);

                            // Append the table to the specified container
                            const container = document.getElementById('table_container_alarm_water_quality');
                            container.appendChild(table);
                        } else {
                            console.log("No data spikes detected.");
                            console.log('Valid lastDatmanValue found. Displaying image instead.');

                            // Create an img element
                            const img = document.createElement('img');
                            img.src = '/apps/alarms/images/passed.png'; // Set the image source
                            img.alt = 'Process Completed'; // Optional alt text for accessibility
                            img.style.width = '50px'; // Optional: set the image width
                            img.style.height = '50px'; // Optional: set the image height

                            // Get the container and append the image
                            const container = document.getElementById('table_container_alarm_water_quality');
                            container.appendChild(img);
                        }
                    } else {
                        console.log("Some last value not detected, calling createTable");
                        // Only call createTable if no valid data exists
                        const table = createTable(combinedData);

                        // Append the table to the specified container
                        const container = document.getElementById('table_container_alarm_water_quality');
                        container.appendChild(table);
                    }

                    loadingIndicator.style.display = 'none';
                })
                .catch(error => {
                    console.error('There was a problem with one or more fetch operations:', error);
                    loadingIndicator.style.display = 'none';
                });

        })
        .catch(error => {
            console.error('There was a problem with the initial fetch operation:', error);
            loadingIndicator.style.display = 'none';
        });

    function filterByLocationCategory(array, setCategory) {
        return array.filter(item =>
            item['location-category'] &&
            item['location-category']['office-id'] === setCategory['office-id'] &&
            item['location-category']['id'] === setCategory['id']
        );
    }

    function subtractHoursFromDate(date, hoursToSubtract) {
        return new Date(date.getTime() - (hoursToSubtract * 60 * 60 * 1000));
    }

    function formatISODate2ReadableDate(timestamp) {
        const date = new Date(timestamp);
        const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month
        const dd = String(date.getDate()).padStart(2, '0'); // Day
        const yyyy = date.getFullYear(); // Year
        const hh = String(date.getHours()).padStart(2, '0'); // Hours
        const min = String(date.getMinutes()).padStart(2, '0'); // Minutes
        return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
    }

    const reorderByAttribute = (data) => {
        data['assigned-time-series'].sort((a, b) => a.attribute - b.attribute);
    };

    const formatTime = (date) => {
        const pad = (num) => (num < 10 ? '0' + num : num);
        return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const findValuesAtTimes = (data) => {
        const result = [];
        const currentDate = new Date();

        // Create time options for 5 AM, 6 AM, and 7 AM today in Central Standard Time
        const timesToCheck = [
            new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 6, 0), // 6 AM CST
            new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 5, 0), // 5 AM CST
            new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 7, 0)  // 7 AM CST
        ];

        const foundValues = [];

        // Iterate over the values in the provided data
        const values = data.values;

        // Check for each time in the order of preference
        timesToCheck.forEach((time) => {
            // Format the date-time to match the format in the data
            const formattedTime = formatTime(time);
            // console.log(formattedTime);

            const entry = values.find(v => v[0] === formattedTime);
            if (entry) {
                foundValues.push({ time: formattedTime, value: entry[1] }); // Store both time and value if found
            } else {
                foundValues.push({ time: formattedTime, value: null }); // Store null if not found
            }
        });

        // Push the result for this data entry
        result.push({
            name: data.name,
            values: foundValues // This will contain the array of { time, value } objects
        });

        return result;
    };

    function getLastNonNullValue(data, tsid) {
        // Iterate over the values array in reverse
        for (let i = data.values.length - 1; i >= 0; i--) {
            // Check if the value at index i is not null
            if (data.values[i][1] !== null) {
                // Return the non-null value as separate variables
                return {
                    tsid: tsid,
                    timestamp: data.values[i][0],
                    value: data.values[i][1],
                    qualityCode: data.values[i][2]
                };
            }
        }
        // If no non-null value is found, return null
        return null;
    }

    function getMaxValue(data, tsid) {
        let maxEntry = null;

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            // Check if the value at index i is not null and within a reasonable range
            // if (data.values[i][1] !== null && data.values[i][1] > 99999) { // Adjust threshold as necessary
                // Check if the value at index i is not null
                if (data.values[i][1] !== null) {
                    // If maxEntry is null or the current value is greater than the maxEntry's value
                    if (maxEntry === null || data.values[i][1] > maxEntry.value) {
                        maxEntry = {
                            tsid: tsid,
                            timestamp: data.values[i][0],
                            value: data.values[i][1],
                            qualityCode: data.values[i][2]
                        };
                    }
                }
            // }
        }

        // Return the max entry (or null if no valid values were found)
        return maxEntry;
    }

    function getMinValue(data, tsid) {
        let minEntry = null;

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            // Check if the value at index i is not null and within a reasonable range
            // if (data.values[i][1] !== null && data.values[i][1] < 99999) { // Adjust threshold as necessary
                // Check if the value at index i is not null
                if (data.values[i][1] !== null) {
                    // If minEntry is null or the current value is smaller than the minEntry's value
                    if (minEntry === null || data.values[i][1] < minEntry.value) {
                        minEntry = {
                            tsid: tsid,
                            timestamp: data.values[i][0],
                            value: data.values[i][1],
                            qualityCode: data.values[i][2]
                        };
                    }
                }
            // }

            // Return the min entry (or null if no valid values were found)
            return minEntry;
        }
    }

    function hasLastValue(data) {
        let allLocationsValid = true; // Flag to track if all locations are valid

        // Iterate through each key in the data object
        for (const locationIndex in data) {
            if (data.hasOwnProperty(locationIndex)) { // Ensure the key belongs to the object
                const item = data[locationIndex];
                console.log(`Checking basin ${parseInt(locationIndex) + 1}:`, item); // Log the current item being checked

                const assignedLocations = item['assigned-locations'];
                // Check if assigned-locations is an object
                if (typeof assignedLocations !== 'object' || assignedLocations === null) {
                    console.log('No assigned-locations found in basin:', item);
                    allLocationsValid = false; // Mark as invalid since no assigned locations are found
                    continue; // Skip to the next basin
                }

                // Iterate through each location in assigned-locations
                for (const locationName in assignedLocations) {
                    const location = assignedLocations[locationName];
                    console.log(`Checking location: ${locationName}`, location); // Log the current location being checked

                    const tempWaterLastValueArray = location['temp-water-last-value'];
                    const depthLastValueArray = location['depth-last-value'];
                    const doLastValueArray = location['do-last-value'];

                    // Check for valid temp-water-last-value entries
                    let hasValidValue = false;

                    if (Array.isArray(tempWaterLastValueArray)) {
                        const validTempWaterEntries = tempWaterLastValueArray.filter(entry =>
                            entry && entry.value !== 'N/A'
                        );

                        if (validTempWaterEntries.length > 0) {
                            console.log(`Valid 'temp-water' entries found in location ${locationName}:`, validTempWaterEntries);
                            hasValidValue = true;
                        }
                    }

                    // Check for valid depth-last-value entries
                    if (Array.isArray(depthLastValueArray)) {
                        const validDepthEntries = depthLastValueArray.filter(entry =>
                            entry && entry.value !== 'N/A'
                        );

                        if (validDepthEntries.length > 0) {
                            console.log(`Valid 'depth' entries found in location ${locationName}:`, validDepthEntries);
                            hasValidValue = true;
                        }
                    }

                    // Check for valid do-last-value entries
                    if (Array.isArray(doLastValueArray)) {
                        const validDoEntries = doLastValueArray.filter(entry =>
                            entry && entry.value !== 'N/A'
                        );

                        if (validDoEntries.length > 0) {
                            console.log(`Valid 'do' entries found in location ${locationName}:`, validDoEntries);
                            hasValidValue = true;
                        }
                    }

                    // If none of the arrays have a valid entry, mark the location as invalid
                    if (!hasValidValue) {
                        console.log(`No valid entries found in location ${locationName}.`);
                        allLocationsValid = false; // Set flag to false if any location is invalid
                    }
                }
            }
        }

        // Return true only if all locations are valid
        if (allLocationsValid) {
            console.log('All locations have valid entries.');
            return true;
        } else {
            console.log('Some locations are missing valid entries.');
            return false;
        }
    }

    function hasDataSpike(data) {
        // Iterate through each key in the data object
        for (const locationIndex in data) {
            if (data.hasOwnProperty(locationIndex)) { // Ensure the key belongs to the object
                const item = data[locationIndex];
                console.log(`Checking basin ${parseInt(locationIndex) + 1}:`, item); // Log the current item being checked

                const assignedLocations = item['assigned-locations'];
                // Check if assigned-locations is an object
                if (typeof assignedLocations !== 'object' || assignedLocations === null) {
                    // console.log('No assigned-locations found in basin:', item);
                    continue; // Skip to the next basin
                }

                // Iterate through each location in assigned-locations
                for (const locationName in assignedLocations) {
                    const location = assignedLocations[locationName];
                    console.log(`Checking location: ${locationName}`, location); // Log the current location being checked

                    const minTempWaterData = location['temp-water-min-value'];
                    console.log("minTempWaterData: ", minTempWaterData);

                    const minDepthData = location['depth-min-value'];
                    console.log("minDepthData: ", minDepthData);

                    const minDoData = location['do-min-value'];
                    console.log("minDoData: ", minDoData);

                    const maxTempWaterData = location['temp-water-max-value'];
                    console.log("maxTempWaterData: ", maxTempWaterData);

                    const maxDepthData = location['depth-max-value'];
                    console.log("maxDepthData: ", maxDepthData);

                    const maxDoData = location['do-max-value'];
                    console.log("maxDoData: ", maxDoData);


                    // Helper function to check for data spikes in a given data array
                    const checkForSpikes = (dataArray, dataType) => {
                        let spikeDetected = false;

                        // Iterate through the data array and find any value exceeding limits
                        dataArray.forEach(entry => {
                            const value = parseFloat(entry.value); // Assuming the value is stored in the 'value' property
                            console.log(`Checking ${dataType} value: `, value);

                            // Check if the value exceeds 999 or is less than -9000
                            if (value > 999 || value < -999) {
                                console.log(`Data spike detected in location ${locationName}: ${dataType} value = ${value}`);
                                spikeDetected = true; // Spike detected
                            }
                        });

                        return spikeDetected; // Return true if any spike is found
                    };

                    // Check for spikes in temperature water, depth, and DO data
                    if (checkForSpikes(minTempWaterData, 'temp-water-min') ||
                        checkForSpikes(maxTempWaterData, 'temp-water-max') ||

                        checkForSpikes(minDepthData, 'depth-min') ||
                        checkForSpikes(maxDepthData, 'depth-max') ||

                        checkForSpikes(minDoData, 'depth-min') ||
                        checkForSpikes(maxDoData, 'depth-max')) {
                        return true; // Return true if any spike is found
                    }
                }
            }
        }
        return false; // Return false if no spikes are found in any locations
    }

    function createTable(data) {
        const table = document.createElement('table');
        table.id = 'customers'; // Assigning the ID of "customers"

        data.forEach(item => {
            // Create header row for the item's ID
            const headerRow = document.createElement('tr');
            const idHeader = document.createElement('th');
            idHeader.colSpan = 3;
            // Apply styles
            idHeader.style.backgroundColor = 'darkblue';
            idHeader.style.color = 'white';
            idHeader.textContent = item.id; // Display the item's ID
            headerRow.appendChild(idHeader);
            table.appendChild(headerRow);

            // Create subheader row for "Time Series", "Value", "Latest Time"
            const subHeaderRow = document.createElement('tr');
            ['Time Series', 'Value', 'Latest Time'].forEach(headerText => {
                const td = document.createElement('td');
                td.textContent = headerText;
                subHeaderRow.appendChild(td);
            });
            table.appendChild(subHeaderRow);

            // Process each assigned location
            item['assigned-locations'].forEach(location => {
                const tempWaterData = location['extents-data']?.['temp-water'] || [];
                const depthData = location['extents-data']?.['depth'] || [];
                const doData = location['extents-data']?.['do'] || [];

                // Function to create data row
                const createDataRow = (tsid, value, timestamp) => {
                    const dataRow = document.createElement('tr');

                    const nameCell = document.createElement('td');
                    nameCell.textContent = tsid;

                    const lastValueCell = document.createElement('td');

                    // Wrap the value in a span with the blinking-text class
                    const valueSpan = document.createElement('span');
                    valueSpan.classList.add('blinking-text');
                    valueSpan.textContent = value;
                    lastValueCell.appendChild(valueSpan);

                    const latestTimeCell = document.createElement('td');
                    latestTimeCell.textContent = timestamp;

                    dataRow.appendChild(nameCell);
                    dataRow.appendChild(lastValueCell);
                    dataRow.appendChild(latestTimeCell);

                    table.appendChild(dataRow);
                };

                // Process temperature water data
                tempWaterData.forEach(tempEntry => {
                    const tsid = tempEntry.name; // Time-series ID from extents-data

                    // Safely access 'temp-water-last-value'
                    const lastTempValue = (Array.isArray(location['temp-water-last-value'])
                        ? location['temp-water-last-value'].find(entry => entry && entry.tsid === tsid)
                        : null) || { value: 'N/A', timestamp: 'N/A' };

                    let dateTime = null;
                    if (lastTempValue && lastTempValue.value !== 'N/A' && lastTempValue.value > - 900 && lastTempValue.value < 900) {
                        // Format lastTempValue to two decimal places
                        lastTempValue.value = parseFloat(lastTempValue.value).toFixed(2);
                        dateTime = lastTempValue.timestamp;
                    } else {
                        dateTime = tempEntry.latestTime;
                        createDataRow(tsid, lastTempValue.value, dateTime);
                    }
                });

                // Process depth data
                depthData.forEach(depthEntry => {
                    const tsid = depthEntry.name; // Time-series ID from extents-data

                    // Safely access 'depth-last-value'
                    const lastDepthValue = (Array.isArray(location['depth-last-value'])
                        ? location['depth-last-value'].find(entry => entry && entry.tsid === tsid)
                        : null) || { value: 'N/A', timestamp: 'N/A' };

                    let dateTimeDepth = null;
                    if (lastDepthValue && lastDepthValue.value !== 'N/A' && lastDepthValue.value > - 900 && lastDepthValue.value < 900) {
                        // Format lastDepthValue to two decimal places
                        lastDepthValue.value = parseFloat(lastDepthValue.value).toFixed(2);
                        dateTimeDepth = lastDepthValue.timestamp;
                    } else {
                        dateTimeDepth = depthEntry.latestTime;
                        createDataRow(tsid, lastDepthValue.value, dateTimeDepth);
                    }
                });

                // Process DO (dissolved oxygen) data
                doData.forEach(doEntry => {
                    const tsid = doEntry.name; // Time-series ID from extents-data

                    // Safely access 'do-last-value'
                    const lastDoValue = (Array.isArray(location['do-last-value'])
                        ? location['do-last-value'].find(entry => entry && entry.tsid === tsid)
                        : null) || { value: 'N/A', timestamp: 'N/A' };

                    let dateTimeDo = null;
                    if (lastDoValue && lastDoValue.value !== 'N/A' && lastDoValue.value > - 900 && lastDoValue.value < 900) {
                        // Format lastDoValue to two decimal places
                        lastDoValue.value = parseFloat(lastDoValue.value).toFixed(2);
                        dateTimeDo = lastDoValue.timestamp;
                    } else {
                        dateTimeDo = doEntry.latestTime;
                        createDataRow(tsid, lastDoValue.value, dateTimeDo);
                    }
                });

                // If no data available for temp-water, depth, and do
                if (tempWaterData.length === 0 && depthData.length === 0 && doData.length === 0) {
                    const dataRow = document.createElement('tr');

                    const nameCell = document.createElement('td');
                    nameCell.textContent = 'No Data Available';
                    nameCell.colSpan = 3; // Span across all three columns

                    dataRow.appendChild(nameCell);
                    table.appendChild(dataRow);
                }

            });
        });

        return table;
    }

    function createTableDataSpike(data) {
        const table = document.createElement('table');
        table.id = 'customers'; // Assigning the ID of "customers"
    
        data.forEach(item => {
            const assignedLocations = item['assigned-locations'];
    
            // Proceed only if there are assigned locations
            if (Array.isArray(assignedLocations) && assignedLocations.length > 0) {

                // Process each assigned location
                assignedLocations.forEach(location => {
                    let hasDataRows = false; // Flag to check if any valid data rows are created

                    const tempWaterMaxData = location['temp-water-max-value'] || [];
                    const depthMaxData = location['depth-max-value'] || [];
                    const doMaxData = location['do-max-value'] || [];
    
                    const tempWaterMinData = location['temp-water-min-value'] || [];
                    const depthMinData = location['depth-min-value'] || [];
                    const doMinData = location['do-min-value'] || [];
    
                    const ownerData = location['owner'][`assigned-locations`] || [];
                    const locationIdData = location['location-id'] || [];
                    console.log("ownerData: ", ownerData);
                    console.log("locationIdData: ", locationIdData);
    
                    // Temporary storage for data entries to check for spikes
                    const spikeData = [];
    
                    // Check each data type for spikes, with both min and max values
                    const checkForSpikes = (minDataArray, maxDataArray, type) => {
                        minDataArray.forEach((minEntry, index) => {
                            const tsid = minEntry.tsid;
                            const minValue = parseFloat(minEntry.value); // Get min value
                            const maxEntry = maxDataArray[index];
                            const maxValue = parseFloat(maxEntry?.value || 0); // Get max value (ensure no undefined)
                            const latestTime = minEntry.timestamp; // Use timestamp from minDataArray
    
                            // Check for spike condition (both min and max)
                            if (maxValue > 999 || minValue < -999) {
                                spikeData.push({
                                    tsid,
                                    maxValue: maxValue.toFixed(2),
                                    minValue: minValue.toFixed(2),
                                    timestamp: latestTime
                                });
                                hasDataRows = true; // Mark that we have valid data rows
                            }
                        });
                    };
    
                    // Check for spikes in each type of data
                    checkForSpikes(tempWaterMinData, tempWaterMaxData, 'Temp-Water');
                    checkForSpikes(depthMinData, depthMaxData, 'Depth');
                    checkForSpikes(doMinData, doMaxData, 'DO');
    
                    // Log the collected spike data for debugging
                    console.log(`Spike data for location ${location[`location-id`]}:`, spikeData);
                    console.log("hasDataRows: ", hasDataRows);
    
                    // Create header and subheader if we have spike data
                    if (hasDataRows) {
                        // Create header row for the item's ID
                        const headerRow = document.createElement('tr');
                        const idHeader = document.createElement('th');
                        idHeader.colSpan = 4; // Adjusting colspan for an additional column
                        idHeader.style.backgroundColor = 'darkblue';
                        idHeader.style.color = 'white';
                        idHeader.textContent = item.id; // Display the item's ID
                        headerRow.appendChild(idHeader);
                        table.appendChild(headerRow);
    
                        // Create subheader row for "Time Series", "Max Value", "Min Value", "Latest Time"
                        const subHeaderRow = document.createElement('tr');
                        ['Time Series', 'Max Value', 'Min Value', 'Latest Time'].forEach(headerText => {
                            const td = document.createElement('td');
                            td.textContent = headerText;
                            subHeaderRow.appendChild(td);
                        });
                        table.appendChild(subHeaderRow);
    
                        // Append data rows for spikes
                        spikeData.forEach(({ tsid, maxValue, minValue, timestamp }) => {
                            createDataRow(tsid, maxValue, minValue, timestamp, ownerData, locationIdData);
                        });
                    }
                });
            }
        });
    
        return table;
    
        // Helper function to create data rows
        function createDataRow(tsid, maxValue, minValue, timestamp, ownerData, locationIdData) {
            const dataRow = document.createElement('tr');
    
            const nameCell = document.createElement('td');
            nameCell.textContent = tsid;
    
            // Check if locationIdData matches any entry in ownerData
            const isMatch = ownerData.some(owner => owner['location-id'] === locationIdData);
            if (!isMatch) {
                nameCell.style.color = 'darkblue'; // Apply dark blue color if there's a match
            }
    
            const maxValueCell = document.createElement('td');
            // Wrap the max value in a span with the blinking-text class
            const maxValueSpan = document.createElement('span');
            maxValueSpan.classList.add('blinking-text');
            maxValueSpan.textContent = maxValue;
            maxValueCell.appendChild(maxValueSpan);
    
            const minValueCell = document.createElement('td');
            // Wrap the min value in a span with the blinking-text class
            const minValueSpan = document.createElement('span');
            minValueSpan.classList.add('blinking-text');
            minValueSpan.textContent = minValue;
            minValueCell.appendChild(minValueSpan);
    
            const latestTimeCell = document.createElement('td');
            latestTimeCell.textContent = timestamp;
    
            dataRow.appendChild(nameCell);
            dataRow.appendChild(maxValueCell);
            dataRow.appendChild(minValueCell);
            dataRow.appendChild(latestTimeCell);
    
            table.appendChild(dataRow);
        }
    }
    
});