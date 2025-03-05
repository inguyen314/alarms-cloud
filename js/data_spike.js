document.addEventListener('DOMContentLoaded', async function () {
    // Delay execution for 30 seconds (30000 milliseconds)
    await new Promise(resolve => setTimeout(resolve, 40000));

    const currentDateTime = new Date();

    let setLocationCategory = null;
    let setLocationGroupOwner = null;
    let setTimeseriesGroup1 = null;
    let setTimeseriesGroup2 = null;
    let setLookBackHours = null;
    let reportDiv = null;

    reportDiv = "alarm_data_spike";
    setLocationCategory = "Basins";
    setLocationGroupOwner = "MVS";
    setTimeseriesGroup1 = "Stage";
    setTimeseriesGroup2 = "Datman";
    setLookBackHours = subtractHoursFromDate(new Date(), 96);


    // Display the loading indicator for water quality alarm
    const loadingIndicator = document.getElementById(`loading_${reportDiv}`);
    loadingIndicator.style.display = 'block';

    console.log("setLocationCategory: ", setLocationCategory);
    console.log("setLocationGroupOwner: ", setLocationGroupOwner);
    console.log("setTimeseriesGroup1: ", setTimeseriesGroup1);
    console.log("setTimeseriesGroup2: ", setTimeseriesGroup2);
    console.log("setLookBackHours: ", setLookBackHours);

    let setBaseUrl = null;
    if (cda === "internal") {
        setBaseUrl = `https://wm.${office.toLowerCase()}.ds.usace.army.mil:8243/${office.toLowerCase()}-data/`;
        // console.log("setBaseUrl: ", setBaseUrl);
    } else if (cda === "public") {
        setBaseUrl = `https://cwms-data.usace.army.mil/cwms-data/`;
        // console.log("setBaseUrl: ", setBaseUrl);
    }

    // Define the URL to fetch location groups based on category
    const categoryApiUrl = setBaseUrl + `location/group?office=${office}&include-assigned=false&location-category-like=${setLocationCategory}`;
    // console.log("categoryApiUrl: ", categoryApiUrl);

    // Initialize maps to store metadata and time-series ID (TSID) data for various parameters
    const ownerMap = new Map();
    const tsidStageRevMap = new Map();
    const tsidDatmanMap = new Map();

    // Initialize arrays for storing promises
    const ownerPromises = [];
    const stageRevTsidPromises = [];
    const datmanTsidPromises = [];

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
            const targetCategory = { "office-id": office, "id": setLocationCategory };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map(item => item.id);

            if (basins.length === 0) {
                console.warn('No basins found for the given category.');
                return;
            }

            // Initialize an array to store promises for fetching basin data
            const apiPromises = [];
            let combinedData = [];

            // Loop through each basin and fetch data for its assigned locations
            basins.forEach(basin => {
                const basinApiUrl = setBaseUrl + `location/group/${basin}?office=${office}&category-id=${setLocationCategory}`;
                // console.log("basinApiUrl: ", basinApiUrl);

                apiPromises.push(
                    fetch(basinApiUrl)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(`Network response was not ok for basin ${basin}: ${response.statusText}`);
                            }
                            return response.json();
                        })
                        .then(getBasin => {
                            // console.log('getBasin:', getBasin);

                            if (!getBasin) {
                                // console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            // Filter and sort assigned locations based on 'attribute' field
                            getBasin[`assigned-locations`] = getBasin[`assigned-locations`].filter(location => location.attribute <= 900);
                            getBasin[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(getBasin);

                            // If assigned locations exist, fetch metadata and time-series data
                            if (getBasin['assigned-locations']) {
                                getBasin['assigned-locations'].forEach(loc => {
                                    let ownerApiUrl = setBaseUrl + `location/group/${setLocationGroupOwner}?office=${office}&category-id=${office}`;
                                    console.log("ownerApiUrl: ", ownerApiUrl);

                                    if (ownerApiUrl) {
                                        ownerPromises.push(
                                            fetch(ownerApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        console.warn(`Datman TSID data not found for location: ${loc['location-id']}`);
                                                        return null;
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(ownerData => {
                                                    if (ownerData) {
                                                        ownerMap.set(loc['location-id'], ownerData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${ownerApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    // Fetch stage TSID data
                                    const tsidStageRevApiUrl = setBaseUrl + `timeseries/group/${setTimeseriesGroup1}?office=${office}&category-id=${loc['location-id']}`;
                                    // console.log("tsidStageRevApiUrl: ", tsidStageRevApiUrl);
                                    stageRevTsidPromises.push(
                                        fetch(tsidStageRevApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null;
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidStageRevData => {
                                                if (tsidStageRevData) {
                                                    tsidStageRevMap.set(loc['location-id'], tsidStageRevData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidStageRevApiUrl}:`, error);
                                            })
                                    );

                                    // Fetch datman TSID data
                                    const tsidDatmanApiUrl = setBaseUrl + `timeseries/group/${setTimeseriesGroup2}?office=${office}&category-id=${loc['location-id']}`;
                                    // console.log("tsidDatmanApiUrl: ", tsidDatmanApiUrl);
                                    datmanTsidPromises.push(
                                        fetch(tsidDatmanApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null;
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidDatmanData => {
                                                if (tsidDatmanData) {
                                                    tsidDatmanMap.set(loc['location-id'], tsidDatmanData);
                                                }
                                            })
                                            .catch(error => {
                                                console.error(`Problem with the fetch operation for stage TSID data at ${tsidDatmanApiUrl}:`, error);
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
                .then(() => Promise.all(ownerPromises))
                .then(() => Promise.all(stageRevTsidPromises))
                .then(() => Promise.all(datmanTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                // Add owner to json
                                const ownerMapData = ownerMap.get(loc['location-id']);
                                if (ownerMapData) {
                                    loc['owner'] = ownerMapData;
                                }

                                // Add stage-rev to json
                                const tsidStageRevMapData = tsidStageRevMap.get(loc['location-id']);
                                if (tsidStageRevMapData) {
                                    reorderByAttribute(tsidStageRevMapData);
                                    loc['tsid-stage-rev'] = tsidStageRevMapData;
                                } else {
                                    loc['tsid-stage-rev'] = null;
                                }

                                // Add datman to json
                                const tsidDatmanMapData = tsidDatmanMap.get(loc['location-id']);
                                if (tsidDatmanMapData) {
                                    reorderByAttribute(tsidDatmanMapData);
                                    loc['tsid-datman'] = tsidDatmanMapData;
                                } else {
                                    loc['tsid-datman'] = null;
                                }

                                // Initialize empty arrays to hold API and last-value data for various parameters
                                loc['stage-rev-api-data'] = [];
                                loc['stage-rev-last-value'] = [];
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    const timeSeriesDataPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature, depth, and DO time series
                            const datmanTimeSeries = locData['tsid-stage-rev']?.['assigned-time-series'] || [];

                            // Function to create fetch promises for time series data
                            const timeSeriesDataFetchPromises = (timeSeries, type) => {
                                return timeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    const timeSeriesDataApiUrl = setBaseUrl + `timeseries?name=${tsid}&begin=${setLookBackHours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;
                                    // console.log('timeSeriesDataApiUrl:', timeSeriesDataApiUrl);

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

                                            // console.log("data: ", data);

                                            let apiDataKey;
                                            if (type === 'stage-rev') {
                                                apiDataKey = 'stage-rev-api-data'; // Assuming 'do-api-data' is the key for dissolved oxygen data
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return to avoid pushing data if type is unknown
                                            }

                                            locData[apiDataKey].push(data);

                                            let lastValueKey;
                                            if (type === 'stage-rev') {
                                                lastValueKey = 'stage-rev-last-value';  // Assuming 'do-last-value' is the key for dissolved oxygen last value
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            let maxValueKey;
                                            if (type === 'stage-rev') {
                                                maxValueKey = 'stage-rev-max-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            let minValueKey;
                                            if (type === 'stage-rev') {
                                                minValueKey = 'stage-rev-min-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            if (!locData[lastValueKey]) {
                                                locData[lastValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            if (!locData[maxValueKey]) {
                                                locData[maxValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            if (!locData[minValueKey]) {
                                                locData[minValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // Get and store the last non-null value for the specific tsid
                                            const lastValue = getLastNonNullValue(data, tsid);

                                            // Get and store the last max value for the specific tsid
                                            const maxValue = getMaxValue(data, tsid);
                                            // console.log("maxValue: ", maxValue);

                                            // Get and store the last min value for the specific tsid
                                            const minValue = getMinValue(data, tsid);
                                            // console.log("minValue: ", minValue);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[lastValueKey].push(lastValue);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[maxValueKey].push(maxValue);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[minValueKey].push(minValue);
                                        })

                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };

                            // Create promises for temperature, depth, and DO time series
                            const datmanPromises = timeSeriesDataFetchPromises(datmanTimeSeries, 'stage-rev');

                            // Additional API call for extents data
                            const timeSeriesDataExtentsApiCall = async (type) => {
                                const extentsApiUrl = setBaseUrl + `catalog/TIMESERIES?page-size=5000&office=${office}`;
                                // console.log('extentsApiUrl:', extentsApiUrl);

                                try {
                                    const res = await fetch(extentsApiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    });
                                    const data = await res.json();
                                    locData['extents-api-data'] = data;
                                    locData[`extents-data`] = {};

                                    // Collect TSIDs from temp, depth, and DO time series
                                    const datmanTids = datmanTimeSeries.map(series => series['timeseries-id']);
                                    const allTids = [...datmanTids]; // Combine both arrays

                                    allTids.forEach((tsid, index) => {
                                        const matchingEntry = data.entries.find(entry => entry['name'] === tsid);
                                        if (matchingEntry) {
                                            // Convert times from UTC
                                            let latestTimeUTC = matchingEntry.extents[0]?.['latest-time'];
                                            let earliestTimeUTC = matchingEntry.extents[0]?.['earliest-time'];

                                            // Convert UTC times to Date objects
                                            let latestTimeCST = new Date(latestTimeUTC);
                                            let earliestTimeCST = new Date(earliestTimeUTC);

                                            // Function to format date as "MM-DD-YYYY HH:mm"
                                            const formatDate = (date) => {
                                                return date.toLocaleString('en-US', {
                                                    timeZone: 'America/Chicago', // Set the timezone to Central Time (CST/CDT)
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    hour12: false // Use 24-hour format
                                                }).replace(',', ''); // Remove the comma from the formatted string
                                            };

                                            // Format the times to CST/CDT
                                            let formattedLatestTime = formatDate(latestTimeCST);
                                            let formattedEarliestTime = formatDate(earliestTimeCST);

                                            // Construct the _data object with formatted times
                                            let _data = {
                                                office: matchingEntry.office,
                                                name: matchingEntry.name,
                                                earliestTime: formattedEarliestTime, // Use formatted earliestTime
                                                earliestTimeISO: earliestTimeCST.toISOString(), // Store original ISO format as well
                                                lastUpdate: matchingEntry.extents[0]?.['last-update'],
                                                latestTime: formattedLatestTime, // Use formatted latestTime
                                                latestTimeISO: latestTimeCST.toISOString(), // Store original ISO format as well
                                                tsid: matchingEntry['timeseries-id'],
                                            };

                                            // Determine extent key based on tsid
                                            let extent_key;
                                            if (tsid.includes('Stage') || tsid.includes('Elev') || tsid.includes('Flow') || tsid.includes('Conc-DO')) {
                                                extent_key = 'stage-rev';
                                            } else {
                                                return; // Ignore if it doesn't match the condition
                                            }

                                            // Update locData with extents-data
                                            if (!locData[`extents-data`][extent_key]) {
                                                locData[`extents-data`][extent_key] = [_data];
                                            } else {
                                                locData[`extents-data`][extent_key].push(_data);
                                            }

                                        } else {
                                            console.warn(`No matching entry found for TSID: ${tsid}`);
                                        }
                                    });
                                } catch (error) {
                                    console.error(`Error fetching additional data for location ${locData['location-id']}:`, error);
                                }
                            };

                            // Combine all promises for this location
                            timeSeriesDataPromises.push(Promise.all([...datmanPromises, timeSeriesDataExtentsApiCall()]));
                        }
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(timeSeriesDataPromises);
                })
                .then(() => {
                    // Assuming this is inside a promise chain (like in a `.then()`)

                    console.log('All combinedData data fetched successfully:', combinedData);

                    // Step 1: Filter out locations where 'attribute' ends with '.1'
                    combinedData.forEach((dataObj, index) => {
                        // Ensure 'assigned-locations' exists and is an array
                        if (Array.isArray(dataObj['assigned-locations'])) {
                            // Filter out locations with 'attribute' ending in '.1'
                            dataObj['assigned-locations'] = dataObj['assigned-locations'].filter(location => {
                                const attribute = location?.['attribute']?.toString();

                                if (attribute?.endsWith('.1')) {
                                    console.log(
                                        // `Removing location with attribute '${attribute}' and id '${location?.['location-id'] || 'unknown'}' at index ${index}`
                                    );
                                    return false; // Filter out this location
                                }

                                return true; // Keep the location
                            });
                        } else {
                            console.warn(`Skipping dataObj at index ${index} as 'assigned-locations' is not a valid array.`);
                        }
                    });

                    console.log('Filtered all locations ending with .1 successfully:', combinedData);

                    // Step 2: Filter out locations where 'location-id' doesn't match owner's 'assigned-locations'
                    combinedData.forEach(dataGroup => {
                        // Check if 'assigned-locations' exists in the dataGroup
                        let locations = dataGroup['assigned-locations'] || [];

                        // Loop through the locations array in reverse to safely remove items
                        for (let i = locations.length - 1; i >= 0; i--) {
                            let location = locations[i];

                            // Check if 'owner' and 'assigned-locations' exist in the location
                            if (location?.owner?.['assigned-locations']) {
                                // Find if the current location-id exists in owner's assigned-locations
                                let matchingOwnerLocation = location['owner']['assigned-locations'].some(ownerLoc =>
                                    ownerLoc['location-id'] === location['location-id']
                                );

                                // If no match, remove the location
                                if (!matchingOwnerLocation) {
                                    // console.log(`Removing location with id ${location['location-id']} as it does not match owner's assigned-locations`);
                                    locations.splice(i, 1);
                                }
                            } else {
                                // If owner or owner's assigned-locations is missing, remove the location
                                console.warn(
                                    `Owner or owner's assigned-locations is undefined for location-id ${location?.['location-id'] || 'unknown'}. Removing the location.`
                                );
                                locations.splice(i, 1);
                            }
                        }
                    });

                    console.log('Filtered all locations by matching location-id with owner successfully:', combinedData);

                    // Step 3: Filter out locations where 'tsid-datman' is null
                    combinedData.forEach(dataGroup => {
                        // Check if 'assigned-locations' exists in the dataGroup
                        let locations = dataGroup['assigned-locations'] || [];

                        // Loop through the locations array in reverse to safely remove items
                        for (let i = locations.length - 1; i >= 0; i--) {
                            let location = locations[i];

                            // Check if 'tsid-datman' is null or undefined
                            let isLocationNull = location?.['tsid-datman'] == null;

                            // If tsid-datman is null, remove the location
                            if (isLocationNull) {
                                // console.log(`Removing location with id ${location?.['location-id'] || 'unknown'} due to null tsid-datman`);
                                locations.splice(i, 1); // Remove the location from the array
                            }
                        }
                    });

                    console.log('Filtered all locations where tsid-datman is null successfully:', combinedData);

                    // Step 4: Filter out basins where 'assigned-locations' is null or has no elements
                    combinedData = combinedData.filter(
                        item => Array.isArray(item['assigned-locations']) && item['assigned-locations'].length > 0
                    );

                    console.log('Filtered all basins where assigned-locations is null or empty successfully:', combinedData);

                    // Check if there are valid lastDatmanValues in the data
                    if (hasDataSpike(combinedData)) {
                        console.log("combinedData has data spike. Calling createTableDataSpike.");
                        // call createTable if data spike exists
                        const table = createTableDataSpike(combinedData);

                        // Append the table to the specified container
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(table);
                    } else {
                        console.log("combinedData has no data spikes detected. Displaying image instead.");

                        // Create an img element
                        const img = document.createElement('img');
                        img.src = '/mvs/alarms/images/passed.png'; // Set the image source
                        img.alt = 'Process Completed'; // Optional alt text for accessibility
                        img.style.width = '50px'; // Optional: set the image width
                        img.style.height = '50px'; // Optional: set the image height

                        // Get the container and append the image
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(img);
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

    function filterByLocationCategory(array, setLocationCategory) {
        return array.filter(item =>
            item['location-category'] &&
            item['location-category']['office-id'] === setLocationCategory['office-id'] &&
            item['location-category']['id'] === setLocationCategory['id']
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
        let maxValue = -Infinity; // Start with the smallest possible value
        let maxEntry = null; // Store the corresponding max entry (timestamp, value, quality code)

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            // Check if the value at index i is not null
            if (data.values[i][1] !== null) {
                // Update maxValue and maxEntry if the current value is greater
                if (data.values[i][1] > maxValue) {
                    maxValue = data.values[i][1];
                    maxEntry = {
                        tsid: tsid,
                        timestamp: data.values[i][0],
                        value: data.values[i][1],
                        qualityCode: data.values[i][2]
                    };
                }
            }
        }

        // Return the max entry (or null if no valid values were found)
        return maxEntry;
    }

    function getMinValue(data, tsid) {
        let minValue = Infinity; // Start with the largest possible value
        let minEntry = null; // Store the corresponding min entry (timestamp, value, quality code)

        // Loop through the values array
        for (let i = 0; i < data.values.length; i++) {
            // Check if the value at index i is not null
            if (data.values[i][1] !== null) {
                // Update minValue and minEntry if the current value is smaller
                if (data.values[i][1] < minValue) {
                    minValue = data.values[i][1];
                    minEntry = {
                        tsid: tsid,
                        timestamp: data.values[i][0],
                        value: data.values[i][1],
                        qualityCode: data.values[i][2]
                    };
                }
            }
        }

        // Return the min entry (or null if no valid values were found)
        return minEntry;
    }

    function hasLastValue(data) {
        let allLocationsValid = true; // Flag to track if all locations are valid

        // Iterate through each key in the data object
        for (const locationIndex in data) {
            if (data.hasOwnProperty(locationIndex)) { // Ensure the key belongs to the object
                const item = data[locationIndex];
                // console.log(`Checking basin ${parseInt(locationIndex) + 1}:`, item); // Log the current item being checked

                const assignedLocations = item['assigned-locations'];
                // Check if assigned-locations is an object
                if (typeof assignedLocations !== 'object' || assignedLocations === null) {
                    // console.log('No assigned-locations found in basin:', item);
                    allLocationsValid = false; // Mark as invalid since no assigned locations are found
                    continue; // Skip to the next basin
                }

                // Iterate through each location in assigned-locations
                for (const locationName in assignedLocations) {
                    const location = assignedLocations[locationName];
                    // console.log(`Checking location: ${locationName}`, location); // Log the current location being checked

                    // Check if location['tsid-temp-water'] exists, if not, set tempWaterTsidArray to an empty array
                    const datmanTsidArray = (location['tsid-stage-rev'] && location['tsid-stage-rev']['assigned-time-series']) || [];
                    const datmanLastValueArray = location['stage-rev-last-value'];
                    // console.log("datmanTsidArray: ", datmanTsidArray);
                    // console.log("datmanLastValueArray: ", datmanLastValueArray);

                    // Check if 'stage-rev-last-value' exists and is an array
                    let hasValidValue = false;

                    if (Array.isArray(datmanTsidArray) && datmanTsidArray.length > 0) {
                        // console.log('datmanTsidArray has data.');

                        // Loop through the datmanLastValueArray and check for null or invalid entries
                        for (let i = 0; i < datmanLastValueArray.length; i++) {
                            const entry = datmanLastValueArray[i];
                            // console.log("Checking entry: ", entry);

                            // Step 1: If the entry is null, set hasValidValue to false
                            if (entry === null) {
                                // console.log(`Entry at index ${i} is null and not valid.`);
                                hasValidValue = false;
                                continue; // Skip to the next iteration, this is not valid
                            }

                            // Step 2: If the entry exists, check if the value is valid
                            if (entry.value !== null && entry.value !== 'N/A' && entry.value !== undefined) {
                                // console.log(`Valid entry found at index ${i}:`, entry);
                                hasValidValue = true; // Set to true only if we have a valid entry
                            } else {
                                // console.log(`Entry at index ${i} has an invalid value:`, entry.value);
                                hasValidValue = false; // Invalid value, so set it to false
                            }
                        }

                        // console.log("hasValidValue: ", hasValidValue);

                        // Log whether a valid entry was found
                        if (hasValidValue) {
                            // console.log("There are valid entries in the array.");
                        } else {
                            // console.log("There are invalid entries found in the array.");
                        }
                    } else {
                        // console.log(`datmanTsidArray is either empty or not an array for location ${locationName}.`);
                    }

                    // If no valid values found in the current location, mark as invalid
                    if (!hasValidValue) {
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

                const assignedLocations = item['assigned-locations'];
                // Check if assigned-locations is an object
                if (typeof assignedLocations !== 'object' || assignedLocations === null) {
                    continue; // Skip to the next basin
                }

                // Iterate through each location in assigned-locations
                for (const locationName in assignedLocations) {
                    const location = assignedLocations[locationName];

                    // Safely check datman-max-value and datman-min-value
                    const datmanMaxValueArray = location['stage-rev-max-value'];
                    const datmanMinValueArray = location['stage-rev-min-value'];

                    // Ensure that both are valid arrays and have at least one element
                    if (Array.isArray(datmanMaxValueArray) && datmanMaxValueArray.length > 0 &&
                        Array.isArray(datmanMinValueArray) && datmanMinValueArray.length > 0) {

                        const datmanMaxValue = datmanMaxValueArray[0]?.value ?? null;
                        const datmanMinValue = datmanMinValueArray[0]?.value ?? null;

                        // Check if datmanMaxValue or datmanMinValue exists and are valid numbers
                        if (datmanMaxValue !== null && datmanMinValue !== null) {
                            // Check if the max value exceeds 999 or the min value is less than -999
                            if (datmanMaxValue > 999) {
                                return true; // Return true if any spike is found
                            }
                            if (datmanMinValue < -999) {
                                return true; // Return true if any spike is found
                            }
                        } else {
                            // Log missing value properties if necessary
                            // console.log(`Invalid datman-max-value or datman-min-value in location ${locationName}`);
                        }
                    } else {
                        // Log invalid arrays if necessary
                        // console.log(`datman-max-value or datman-min-value not found or invalid in location ${locationName}`);
                    }
                }
            }
        }

        // Return false if no data spikes were found
        return false;
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
                    let hasDataRows = false; // Reset flag for each location

                    const datmanMaxData = location['stage-rev-max-value'] || [];
                    const datmanMinData = location['stage-rev-min-value'] || [];
                    const ownerData = location['owner'][`assigned-locations`] || [];
                    const locationIdData = location['location-id'] || [];

                    // console.log("ownerData: ", ownerData);
                    // console.log("locationIdData: ", locationIdData);

                    // Temporary storage for data entries to check for spikes
                    const spikeData = [];

                    // Check each data type for spikes, with both min and max values
                    const checkForSpikes = (minDataArray, maxDataArray) => {
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
                    checkForSpikes(datmanMinData, datmanMaxData);

                    // Log the collected spike data for debugging
                    // console.log("datmanMaxData: ", datmanMaxData);
                    // console.log("datmanMinData: ", datmanMinData);
                    // console.log(`Spike data for location ${location[`location-id`]}:`, spikeData);
                    // console.log("hasDataRows: ", hasDataRows);

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
                        ['Time Series', 'Max Value', 'Min Value', 'Latest Time'].forEach((headerText, index) => {
                            const td = document.createElement('td');
                            td.textContent = headerText;

                            // Set width for each column
                            if (index === 0) {
                                td.style.width = '50%';
                            } else if (index === 1 || index === 2) {
                                td.style.width = '15%';
                            } else {
                                td.style.width = '20%';
                            }

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

            // First column (tsid) as a link
            const nameCell = document.createElement('td');
            const link = document.createElement('a');
            link.href = `https://wm.mvs.ds.usace.army.mil/mvs/chart/index.html?office=MVS&cwms_ts_id=${tsid}&cda=${cda}&lookback=4`; // Set the link's destination (you can modify the URL)
            link.target = '_blank'; // Open link in a new tab
            link.textContent = tsid;
            nameCell.appendChild(link);

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