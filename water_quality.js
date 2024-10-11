document.addEventListener('DOMContentLoaded', async function () {
    // Display the loading indicator
    const loadingIndicator = document.getElementById('loading_alarm_water_quality');
    loadingIndicator.style.display = 'block';

    let category = "Alarm-Water-Quality";

    const apiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/location/group?office=${office}&include-assigned=false&location-category-like=${category}`;
    console.log("apiUrl: ", apiUrl);

    const metadataMap = new Map();
    const tsidTempWaterMap = new Map();
    const tsidDepthMap = new Map();
    const tsidExtentsMap = new Map();

    const metadataPromises = [];
    const tempWaterTsidPromises = [];
    const depthTsidPromises = [];
    const extentsTsidPromises = [];

    // Get current date and time
    const currentDateTime = new Date();
    // Subtract thirty hours from current date and time
    const currentDateTimeMinus30Hours = subtractHoursFromDate(currentDateTime, 2);

    fetch(apiUrl)
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

            const targetCategory = { "office-id": office, "id": category };
            const filteredArray = filterByLocationCategory(data, targetCategory);
            const basins = filteredArray.map(item => item.id);
            if (basins.length === 0) {
                console.warn('No basins found for the given category.');
                return;
            }

            const apiPromises = [];
            const combinedData = [];

            basins.forEach(basin => {
                const basinApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/location/group/${basin}?office=${office}&category-id=${category}`;

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

                            getBasin[`assigned-locations`] = getBasin[`assigned-locations`].filter(location => location.attribute <= 900);
                            getBasin[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(getBasin);

                            if (getBasin['assigned-locations']) {
                                getBasin['assigned-locations'].forEach(loc => {
                                    console.log(loc['location-id']);

                                    // Add Metadata
                                    const locApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/locations/${loc['location-id']}?office=${office}`;
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

                                    // Add Temp Water
                                    const tsidTempWaterApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries/group/Temp-Water?office=${office}&category-id=${loc['location-id']}`;
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

                                    // Depth TSID
                                    const tsidDepthApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries/group/Depth?office=${office}&category-id=${loc['location-id']}`;
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
                                });
                            }
                        })
                        .catch(error => {
                            console.error(`Problem with the fetch operation for basin ${basin}:`, error);
                        })
                );
            });

            Promise.all(apiPromises)
                .then(() => Promise.all(metadataPromises))
                .then(() => Promise.all(tempWaterTsidPromises))
                .then(() => Promise.all(depthTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                // Add metadata to json
                                const metadataMapData = metadataMap.get(loc['location-id']);
                                if (metadataMapData) {
                                    loc['metadata'] = metadataMapData;
                                }

                                // Add temp-water to json
                                const tsidTempWaterMapData = tsidTempWaterMap.get(loc['location-id']);
                                if (tsidTempWaterMapData) {
                                    reorderByAttribute(tsidTempWaterMapData);
                                    loc['tsid-temp-water'] = tsidTempWaterMapData;
                                } else {
                                    loc['tsid-temp-water'] = null;  // Append null if tsidTempWaterMapData is missing
                                }


                                // Add depth to json
                                const tsidDepthMapData = tsidDepthMap.get(loc['location-id']);
                                if (tsidDepthMapData) {
                                    loc['tsid-depth'] = tsidDepthMapData;
                                } else {
                                    loc['tsid-depth'] = null;  // Append null if tsidDepthMapData is missing
                                }


                                // Initialize the new arrays
                                loc['temp-water-api-data'] = [];
                                loc['temp-water-last-value'] = [];
                                loc['depth-api-data'] = [];
                                loc['depth-last-value'] = [];
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    const additionalPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature time series
                            const tempTimeSeries = locData['tsid-temp-water']?.['assigned-time-series'] || [];
                            const depthTimeSeries = locData['tsid-depth']?.['assigned-time-series'] || [];

                            // Function to create fetch promises for time series data
                            const createFetchPromises = (timeSeries, type) => {
                                return timeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    const apiUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${tsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;

                                    return fetch(apiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    })
                                        .then(res => res.json())
                                        .then(data => {
                                            if (data.values) {
                                                data.values.forEach(entry => {
                                                    entry[0] = formatNWSDate(entry[0]);
                                                });
                                            }

                                            // Push the fetched data to locData['temp-water-api-data'] or locData['depth-api-data'] depending on the type
                                            const apiDataKey = type === 'temp-water' ? 'temp-water-api-data' : 'depth-api-data';
                                            locData[apiDataKey].push(data);

                                            // Initialize the last-value array if it doesn't exist for the given type
                                            const lastValueKey = type === 'temp-water' ? 'temp-water-last-value' : 'depth-last-value';
                                            if (!locData[lastValueKey]) {
                                                locData[lastValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // Get and store the last non-null value for the specific tsid
                                            const lastValue = getLastNonNullValue(data, tsid);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[lastValueKey].push(lastValue);

                                        })

                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };


                            // Create promises for temperature and depth time series
                            const tempPromises = createFetchPromises(tempTimeSeries, 'temp-water');
                            const depthPromises = createFetchPromises(depthTimeSeries, 'depth');

                            // Additional API call for extents data
                            const additionalApiCall = (type) => {
                                const additionalApiUrl = `https://cwms-data.usace.army.mil/cwms-data/catalog/TIMESERIES?page-size=5000&office=MVS`;
                                return fetch(additionalApiUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json;version=2'
                                    }
                                })
                                    .then(res => res.json())
                                    .then(data => {
                                        // locData['extents-api-data'] = data;
                                        locData[`extents-data`] = {}

                                        // Collect TSIDs from temp and depth time series
                                        const tempTids = tempTimeSeries.map(series => series['timeseries-id']);
                                        const depthTids = depthTimeSeries.map(series => series['timeseries-id']);
                                        const allTids = [...tempTids, ...depthTids]; // Combine both arrays

                                        // Iterate over all TIDs and create extents data entries
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
                            additionalPromises.push(Promise.all([...tempPromises, ...depthPromises, additionalApiCall()]));
                        }
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(additionalPromises);

                })
                .then(() => {
                    console.log('All combinedData data fetched successfully:', combinedData);

                    // Append the table to the specified container
                    const container = document.getElementById('table_container_alarm_water_quality');
                    const table = createTable(combinedData);
                    container.appendChild(table);

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
});

function filterByLocationCategory(array, category) {
    return array.filter(item =>
        item['location-category'] &&
        item['location-category']['office-id'] === category['office-id'] &&
        item['location-category']['id'] === category['id']
    );
}

function subtractHoursFromDate(date, hoursToSubtract) {
    return new Date(date.getTime() - (hoursToSubtract * 60 * 60 * 1000));
}

function formatNWSDate(timestamp) {
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

function getValidValue(values) {
    // Get the first non-null value from the values array
    const validValue = values.find(valueEntry => valueEntry.value !== null);
    return validValue ? (validValue.value).toFixed(1) : 'N/A';
}

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

const extractTimeData = (additionalData) => {
    const extractedData = additionalData.entries.map(entry => {
        return {
            office: entry.office,
            name: entry.name,
            earliestTime: entry.extents[0]?.earliest - time,
            lastUpdate: entry.extents[0]?.last - update,
            latestTime: entry.extents[0]?.latest - time,
        };
    });
    return extractedData;
};

function createTable(data) {
    const table = document.createElement('table');
    table.id = 'customers'; // Assigning the ID of "customers"

    data.forEach(item => {
        // Create header row for the item's ID
        const headerRow = document.createElement('tr');
        const idHeader = document.createElement('th');
        idHeader.colSpan = 3;
        idHeader.textContent = item.id; // Display the item's ID
        headerRow.appendChild(idHeader);
        table.appendChild(headerRow);

        // Create subheader row for "Time Series", "Value", "Date Time"
        const subHeaderRow = document.createElement('tr');
        ['Time Series', 'Value', 'Date Time'].forEach(headerText => {
            const td = document.createElement('td');
            td.textContent = headerText;
            subHeaderRow.appendChild(td);
        });
        table.appendChild(subHeaderRow);

        // Process each assigned location
        item['assigned-locations'].forEach(location => {
            const tempWaterData = location['extents-data']?.['temp-water'] || [];
            const depthData = location['extents-data']?.['depth'] || [];

            // Function to create data row
            const createDataRow = (tsid, value, timestamp) => {
                const dataRow = document.createElement('tr');

                const nameCell = document.createElement('td');
                nameCell.textContent = tsid;

                const lastValueCell = document.createElement('td');
                lastValueCell.textContent = value;

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

                console.log("lastTempValue: ", lastTempValue);

                let dateTime = null;
                if (lastTempValue && lastTempValue.value !== 'N/A') {
                    // Format lastTempValue to two decimal places
                    lastTempValue.value = parseFloat(lastTempValue.value).toFixed(2);
                    dateTime = lastTempValue.timestamp;
                    
                } else {
                    dateTime = tempEntry.latestTime;
                    createDataRow(tsid, lastTempValue.value, dateTime);
                }

                // createDataRow(tsid, lastTempValue.value, dateTime);
            });


            // Process depth data
            depthData.forEach(depthEntry => {
                const tsid = depthEntry.name; // Time-series ID from extents-data

                // Safely access 'depth-last-value'
                const lastDepthValue = (Array.isArray(location['depth-last-value'])
                    ? location['depth-last-value'].find(entry => entry && entry.tsid === tsid)
                    : null) || { value: 'N/A', timestamp: 'N/A' };

                let dateTimeDepth = null;
                if (lastDepthValue && lastDepthValue.value !== 'N/A') {
                    // Format lastDepthValue to two decimal places
                    lastDepthValue.value = parseFloat(lastDepthValue.value).toFixed(2);
                    dateTimeDepth = lastDepthValue.timestamp;
                } else {
                    dateTimeDepth = depthEntry.latestTime;
                    createDataRow(tsid, lastDepthValue.value, dateTimeDepth);
                }

                // createDataRow(tsid, lastDepthValue.value, dateTimeDepth);
            });


            // If no data available for both temp-water and depth
            if (tempWaterData.length === 0 && depthData.length === 0) {
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