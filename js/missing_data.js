document.addEventListener('DOMContentLoaded', async function () {
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const YesterdayDateTimeAt2359 = getYesterdayAt2359();

    let setLocationCategory = null;
    let setLocationGroupOwner = null;
    let setTimeseriesGroup1 = null;
    let setLookBackDays = null;
    let reportDiv = null;

    reportDiv = "alarm_missing_data";
    setLocationCategory = "Basins";
    setLocationGroupOwner = "Datman";
    setTimeseriesGroup1 = "Stage";
    // setLookBackDays = subtractHoursFromDate(new Date(), 48);
    setLookBackDays = getLookBackDateTime(14);

    // Display the loading indicator for water quality alarm
    const loadingIndicator = document.getElementById(`loading_${reportDiv}`);
    loadingIndicator.style.display = 'block'; // Show the loading indicator

    console.log("setLocationCategory: ", setLocationCategory);
    console.log("setLocationGroupOwner: ", setLocationGroupOwner);
    console.log("setTimeseriesGroup1: ", setTimeseriesGroup1);
    console.log("setLookBackDays: ", setLookBackDays);

    let setBaseUrl = null;
    if (cda === "internal") {
        setBaseUrl = `https://wm.${office.toLowerCase()}.ds.usace.army.mil/${office.toLowerCase()}-data/`;
    } else if (cda === "public") {
        setBaseUrl = `https://cwms-data.usace.army.mil/cwms-data/`;
    }
    // console.log("setBaseUrl: ", setBaseUrl);

    // Define the URL to fetch location groups based on category
    const categoryApiUrl = setBaseUrl + `location/group?office=${office}&group-office-id=${office}&category-office-id=${office}&category-id=${setLocationCategory}`;
    // console.log("categoryApiUrl: ", categoryApiUrl);

    // Initialize maps to store metadata and time-series ID (TSID) data for various parameters
    const ownerMap = new Map();
    const tsidDatmanMap = new Map();

    // Initialize arrays for storing promises
    const ownerPromises = [];
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
                                    // Fetch owner for each location
                                    let ownerApiUrl = setBaseUrl + `location/group/${setLocationGroupOwner}?office=${office}&category-id=${office}`;
                                    // console.log("ownerApiUrl: ", ownerApiUrl);
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
                                                        // console.log("ownerData", ownerData);
                                                        ownerMap.set(loc['location-id'], ownerData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${ownerApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    // Fetch datman TSID data
                                    const tsidDatmanApiUrl = setBaseUrl + `timeseries/group/${setTimeseriesGroup1}?office=${office}&category-id=${loc['location-id']}`;
                                    // console.log('tsidDatmanApiUrl:', tsidDatmanApiUrl);
                                    datmanTsidPromises.push(
                                        fetch(tsidDatmanApiUrl)
                                            .then(response => {
                                                if (response.status === 404) return null; // Skip if not found
                                                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                                                return response.json();
                                            })
                                            .then(tsidDatmanData => {
                                                // // console.log('tsidDatmanData:', tsidDatmanData);
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

                                // Add datman to json
                                const tsidDatmanMapData = tsidDatmanMap.get(loc['location-id']);
                                if (tsidDatmanMapData) {
                                    reorderByAttribute(tsidDatmanMapData);
                                    loc['tsid-datman'] = tsidDatmanMapData;
                                } else {
                                    loc['tsid-datman'] = null;  // Append null if missing
                                }

                                // Initialize empty arrays to hold API and last-value data for various parameters
                                loc['datman-api-data'] = [];
                                loc['datman-last-value'] = [];
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    const timeSeriesDataPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature, depth, and DO time series
                            const datmanTimeSeries = locData['tsid-datman']?.['assigned-time-series'] || [];

                            // Function to create fetch promises for time series data
                            const timeSeriesDataFetchPromises = (timeSeries, type) => {
                                return timeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    const timeSeriesDataApiUrl = setBaseUrl + `timeseries?page-size=10000000&name=${tsid}&begin=${setLookBackDays.toISOString()}&end=${YesterdayDateTimeAt2359.toISOString()}&office=${office}`;
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
                                            if (type === 'datman') {
                                                apiDataKey = 'datman-api-data'; // Assuming 'do-api-data' is the key for dissolved oxygen data
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return to avoid pushing data if type is unknown
                                            }

                                            locData[apiDataKey].push(data);

                                            let lastValueKey;
                                            if (type === 'datman') {
                                                lastValueKey = 'datman-last-value';  // Assuming 'do-last-value' is the key for dissolved oxygen last value
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            let dayValueKey;
                                            if (type === 'datman') {
                                                dayValueKey = 'datman-day-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            let cCountByDayValueKey;
                                            if (type === 'datman') {
                                                cCountByDayValueKey = 'datman-c-count-by-day-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            let cCountValueKey;
                                            if (type === 'datman') {
                                                cCountValueKey = 'datman-c-count-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return; // Early return if the type is unknown
                                            }

                                            if (!locData[lastValueKey]) {
                                                locData[lastValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            if (!locData[dayValueKey]) {
                                                locData[dayValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            if (!locData[cCountByDayValueKey]) {
                                                locData[cCountByDayValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            if (!locData[cCountValueKey]) {
                                                locData[cCountValueKey] = [];  // Initialize as an array if it doesn't exist
                                            }

                                            // Get and store the last non-null value for the specific tsid
                                            const lastValue = getLastNonNullValue(data, tsid);

                                            const dayValue = groupByDay(data, tsid);
                                            // console.log("dayValue: ", dayValue);

                                            const cCountByDay = getCCountByDay(data, tsid);
                                            // console.log("cCountByDay: ", cCountByDay);

                                            const cCount = getCCount(data, tsid);
                                            // console.log("cCount: ", cCount);

                                            // Push the last non-null value to the corresponding last-value array
                                            locData[lastValueKey].push(lastValue);

                                            locData[dayValueKey].push(dayValue);

                                            locData[cCountByDayValueKey].push(cCountByDay);

                                            locData[cCountValueKey].push(cCount);
                                        })

                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };

                            // Create promises for temperature, depth, and DO time series
                            const datmanPromises = timeSeriesDataFetchPromises(datmanTimeSeries, 'datman');

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
                                                extent_key = 'datman';
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
                                        `Removing location with attribute '${attribute}' and id '${location?.['location-id'] || 'unknown'}' at index ${index}`
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
                                    console.log(`Removing location with id ${location['location-id']} as it does not match owner's assigned-locations`);
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
                                console.log(`Removing location with id ${location?.['location-id'] || 'unknown'} due to null tsid-datman`);
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

                    // Print Table Here
                    if (hasMissingData(combinedData)) {
                        console.log("Missing data found. Creating table...");
                        const table = createTable(combinedData, type);

                        // Append the table to the specified container
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(table);
                    } else {
                        console.log("No missing data found.");

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

    function createTable(data, type) {
        const table = document.createElement('table');
        table.id = 'customers';

        console.log("data: ", data);

        data.forEach(item => {
            const rows = []; // Collect valid rows for this basin

            item['assigned-locations'].forEach(location => {
                const datmanTsidData = location['extents-data']?.['datman']?.[0]?.['name'] || 'N/A';
                const datmanCCountRequiredData = location['datman-c-count-value']?.[0] || 'N/A';
                const datmanCCountData = location['datman-c-count-by-day-value'] || [];

                datmanCCountData.forEach(dayData => {
                    Object.entries(dayData).forEach(([date, count]) => {
                        const ratio = datmanCCountRequiredData !== 'N/A' && !isNaN(count)
                            ? (count / datmanCCountRequiredData).toFixed(2)
                            : 'N/A';

                        // Only include rows where ratio is less than 1
                        if (ratio !== 'N/A' && ratio < 1) {
                            const row = document.createElement('tr');

                            // Column 1: datmanTsidData with link
                            const tsidCell = document.createElement('td');
                            if (datmanTsidData !== 'N/A') {
                                const link = document.createElement('a');
                                link.href = `mvs/chart/index.html?office=MVS&cwms_ts_id=${encodeURIComponent(datmanTsidData)}&cda=internal&lookback=7`;
                                link.target = '_blank'; // Open link in a new tab
                                link.textContent = datmanTsidData;
                                tsidCell.appendChild(link);
                            } else {
                                tsidCell.textContent = datmanTsidData;
                            }
                            row.appendChild(tsidCell);

                            // Column 2: Date
                            const dateCell = document.createElement('td');
                            dateCell.textContent = date;
                            row.appendChild(dateCell);

                            // Column 3: datmanCCountRequiredData
                            const requiredCell = document.createElement('td');
                            requiredCell.textContent = datmanCCountRequiredData;
                            row.appendChild(requiredCell);

                            // Column 4: Ratio
                            const ratioCell = document.createElement('td');
                            ratioCell.textContent = ratio;
                            row.appendChild(ratioCell);

                            rows.push(row); // Add the valid row to the collection
                        }
                    });
                });
            });

            // Only add the basin header and rows if there are valid rows
            if (rows.length > 0) {
                const headerRow = document.createElement('tr');
                const idHeader = document.createElement('th');
                idHeader.colSpan = 4;
                idHeader.style.backgroundColor = 'darkblue';
                idHeader.style.color = 'white';
                idHeader.textContent = item.id;
                headerRow.appendChild(idHeader);
                table.appendChild(headerRow);

                // Append all collected rows
                rows.forEach(row => table.appendChild(row));
            }
        });

        return table;
    }

    function groupByDay(data) {
        // Create an object to store the grouped values
        const groupedData = {};

        // Iterate over the values array
        data.values.forEach(([dateTime, value, qualityCode]) => {
            // Extract the date from the datetime string (we only need the date part)
            const date = dateTime.split(' ')[0];

            // Initialize an array for each date if it doesn't exist
            if (!groupedData[date]) {
                groupedData[date] = [];
            }

            // Push the current value into the corresponding date's array
            groupedData[date].push({
                dateTime: dateTime,
                value: value,
                qualityCode: qualityCode
            });
        });

        return groupedData;
    }

    function getLookBackDateTime(daysAgo) {
        // Get the current date
        const now = new Date();

        // Get Central Time offset (in milliseconds) for current time
        const centralTimeOffset = -6 * 60 * 60 * 1000; // Central Standard Time (CST) UTC -6

        // Adjust current date to Central Time by adding the offset
        const centralTime = new Date(now.getTime() + centralTimeOffset);

        // Subtract the passed number of days
        centralTime.setDate(centralTime.getDate() - daysAgo);

        // Set time to 12:01 AM
        centralTime.setHours(0, 0, 0, 0);

        return centralTime;
    }

    function getYesterdayAt2359() {
        // Get the current date
        const now = new Date();

        // Subtract one day to get yesterday
        now.setDate(now.getDate() - 1);

        // Set the time to 23:59:00
        now.setHours(23, 59, 0, 0);

        return now;
    }

    function getCCount(data) {
        // Extract the interval from the name property
        const name = data.name || "";

        // Check for intervals in minutes
        let intervalMatch = name.match(/\.([^\.]+)Minutes\./);
        if (intervalMatch) {
            const interval = intervalMatch[1];
            switch (interval) {
                case "15":
                    return 96;
                case "30":
                    return 48;
                default:
                    return 909;
            }
        }

        // Check for intervals in hours
        intervalMatch = name.match(/\.([^\.]+)Hour\./);
        if (intervalMatch) {
            const interval = intervalMatch[1];
            if (interval === "1") {
                return 24;
            }
        }

        // Default case
        return 909;
    }

    function getCCountByDay(data) {
        // Remove entries where the value is null
        data.values = data.values.filter(entry => entry[1] !== null);

        // console.log("Filtered data:", data);

        // Group filtered values by day
        const groupedByDay = data.values.reduce((acc, [dateTime]) => {
            const day = dateTime.split(" ")[0]; // Extract the day part (e.g., "12-31-2024")
            if (!acc[day]) acc[day] = 0;
            acc[day] += 1; // Increment the count for this day
            return acc;
        }, {});

        // console.log("Grouped by day:", groupedByDay);

        return groupedByDay; // Return the actual counts per day
    }

    function hasMissingData(data) {
        let missingDataFound = false;

        // Check for missing data
        data.forEach(item => {
            item['assigned-locations'].forEach(location => {
                const datmanCCountRequiredData = location['datman-c-count-value']?.[0] || 'N/A';
                const datmanCCountData = location['datman-c-count-by-day-value'] || [];

                datmanCCountData.forEach(dayData => {
                    Object.entries(dayData).forEach(([date, count]) => {
                        const ratio = datmanCCountRequiredData !== 'N/A' && !isNaN(count)
                            ? (count / datmanCCountRequiredData).toFixed(2)
                            : 'N/A';

                        // If ratio is less than 1, mark as missing data
                        if (ratio !== 'N/A' && ratio < 1) {
                            missingDataFound = true;
                        }
                    });
                });
            });
        });

        return missingDataFound;
    }
});