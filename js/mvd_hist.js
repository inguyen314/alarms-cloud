document.addEventListener('DOMContentLoaded', async function () {
    await new Promise(resolve => setTimeout(resolve, 50000));

    const currentDateTime = new Date();

    let setLocationCategory = null;
    let setLocationGroupOwner = null;
    let setTimeseriesGroup1 = null;
    let setLookBackHours = null;
    let reportDiv = null;

    reportDiv = "alarm_mvd_hist";
    setLocationCategory = "Mvd-Hist";
    setLocationGroupOwner = "MVD";
    setTimeseriesGroup1 = "Mvd-Hist";
    setLookBackHours = subtractDaysFromDate(new Date(), 5);

    const loadingIndicator = document.getElementById(`loading_${reportDiv}`);
    loadingIndicator.style.display = 'block';

    console.log("setLocationCategory: ", setLocationCategory);
    console.log("setLocationGroupOwner: ", setLocationGroupOwner);
    console.log("setTimeseriesGroup1: ", setTimeseriesGroup1);
    console.log("setLookBackHours: ", setLookBackHours);

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

                                const tsidDatmanMapData = tsidDatmanMap.get(loc['location-id']);
                                if (tsidDatmanMapData) {
                                    reorderByAttribute(tsidDatmanMapData);
                                    loc['tsid-datman'] = tsidDatmanMapData;
                                } else {
                                    loc['tsid-datman'] = null;
                                }

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
                                            if (type === 'datman') {
                                                apiDataKey = 'datman-api-data';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }

                                            locData[apiDataKey].push(data);

                                            let lastValueKey;
                                            if (type === 'datman') {
                                                lastValueKey = 'datman-last-value';
                                            } else {
                                                console.error('Unknown type:', type);
                                                return;
                                            }

                                            if (!locData[lastValueKey]) {
                                                locData[lastValueKey] = [];
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


                            // Create promises for temperature, depth, and DO time series
                            const datmanPromises = timeSeriesDataFetchPromises(datmanTimeSeries, 'datman');

                            // Additional API call for extents data
                            const timeSeriesDataExtentsApiCall = async (type) => {
                                const extentsApiUrl = setBaseUrl + `catalog/TIMESERIES?page-size=5000&office=${office}&timeseries-group-like=${setTimeseriesGroup1}`;
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

                    const tempLocRemove = ["Barkley Dam-Cumberland", "Anoka-Mississippi", "Bismarck-Missouri", "Grand Rapids-Pokegama Lk", "Kansas City-Missouri", "Kentucky Dam-Tennessee", "Savage-Minnesota", "Sidney-Yellowstone", "Sioux City-Missouri", "St Paul-Mississippi", "Watson-Lac Qui Parle Res"];

                    function removeLocations(data) {
                        data.forEach(basin => {
                            // Top-level assigned-locations
                            if (basin['assigned-locations']) {
                                basin['assigned-locations'] = basin['assigned-locations'].filter(loc =>
                                    !tempLocRemove.includes(loc['location-id'])
                                );

                                // If any assigned-location itself has nested "owner" with assigned-locations
                                basin['assigned-locations'].forEach(loc => {
                                    if (loc.owner && loc.owner['assigned-locations']) {
                                        loc.owner['assigned-locations'] = loc.owner['assigned-locations'].filter(nestedLoc =>
                                            !tempLocRemove.includes(nestedLoc['location-id'])
                                        );
                                    }
                                });
                            }
                        });
                    }

                    removeLocations(combinedData);

                    console.log('All combinedData data fetched successfully and after run tempLocRemove:', combinedData);

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

                    // Check if there are valid lastDatmanValues in the data
                    if (hasLastValue(combinedData)) {
                        console.log("combinedData has all valid data. Displaying image instead.");

                        // Create an img element
                        const img = document.createElement('img');
                        img.src = '/mvs/alarms/images/passed.png'; // Set the image source
                        img.alt = 'Process Completed'; // Optional alt text for accessibility
                        img.style.width = '50px'; // Optional: set the image width
                        img.style.height = '50px'; // Optional: set the image height

                        // Get the container and append the image
                        const container = document.getElementById(`table_container_${reportDiv}`);
                        container.appendChild(img);

                    } else {
                        console.log("combinedData does not have all valid data. Calling createTable");

                        // Only call createTable if no valid data exists
                        const table = createTable(combinedData, type);

                        // Append the table to the specified container
                        const container = document.getElementById(`table_container_${reportDiv}`);
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

    function filterByLocationCategory(array, setLocationCategory) {
        return array.filter(item =>
            item['location-category'] &&
            item['location-category']['office-id'] === setLocationCategory['office-id'] &&
            item['location-category']['id'] === setLocationCategory['id']
        );
    }

    function subtractDaysFromDate(date, daysToSubtract) {
        return new Date(date.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));
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
                    const datmanTsidArray = (location['tsid-datman'] && location['tsid-datman']['assigned-time-series']) || [];
                    const datmanLastValueArray = location['datman-last-value'];
                    // console.log("datmanTsidArray: ", datmanTsidArray);
                    // console.log("datmanLastValueArray: ", datmanLastValueArray);

                    // Check if 'datman-last-value' exists and is an array
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

    function createTable(data, type) {
        const table = document.createElement('table');
        table.id = 'customers';

        // Determine if we're showing all rows based on type
        const showAllRows = type === 'status';

        data.forEach(item => {
            let shouldPrintHeader = false;

            // Process each assigned location
            item['assigned-locations'].forEach(location => {
                const datmanData = location['extents-data']?.['datman'] || [];

                // Process each datmanEntry
                datmanData.forEach(datmanEntry => {
                    const tsid = datmanEntry.name;
                    const earliestTime = datmanEntry.earliestTime;
                    const latestTime = datmanEntry.latestTime;

                    // Check if 'datman-last-value' and corresponding entry exist
                    const lastDatmanValue = location['datman-last-value']?.find(entry => entry && entry.tsid === tsid) || { value: 'N/A', timestamp: 'N/A' };

                    // If type is "status", show all rows. Otherwise, show only when lastDatmanValue is 'N/A'
                    const shouldDisplayRow = showAllRows || (lastDatmanValue.value === 'N/A');

                    if (shouldDisplayRow) {
                        // Only print the header once if needed
                        if (!shouldPrintHeader) {
                            // Create header row for the item's ID
                            const headerRow = document.createElement('tr');
                            const idHeader = document.createElement('th');
                            idHeader.colSpan = 4;
                            idHeader.style.backgroundColor = 'darkblue';
                            idHeader.style.color = 'white';
                            idHeader.textContent = item.id;
                            headerRow.appendChild(idHeader);
                            table.appendChild(headerRow);

                            // Create subheader row
                            const subHeaderRow = document.createElement('tr');
                            ['Time Series', 'Value', 'Earliest Time', 'Latest Time'].forEach(headerText => {
                                const td = document.createElement('td');
                                td.textContent = headerText;
                                subHeaderRow.appendChild(td);
                            });
                            table.appendChild(subHeaderRow);

                            shouldPrintHeader = true;
                        }

                        // Create the link for tsid
                        const link = document.createElement('a');
                        link.href = `mvs/chart/index.html?office=MVS&cwms_ts_id=${tsid}&cda=${cda}&lookback=4`;
                        link.target = '_blank'; // Open link in a new tab
                        link.textContent = tsid;

                        // Convert the value to a number and apply toFixed(2) if it's numeric
                        let valueDisplay;
                        if (lastDatmanValue.value === 'N/A') {
                            valueDisplay = 'N/A';
                        } else {
                            const numericValue = Number(lastDatmanValue.value);
                            valueDisplay = isNaN(numericValue) ? 'N/A' : numericValue.toFixed(2);
                        }

                        const valueSpan = document.createElement('span');
                        if (lastDatmanValue.value === 'N/A') {
                            valueSpan.classList.add('blinking-text');
                        }
                        valueSpan.textContent = valueDisplay;

                        const createDataRow = (cells) => {
                            const dataRow = document.createElement('tr');
                            cells.forEach(cellValue => {
                                const cell = document.createElement('td');
                                if (cellValue instanceof HTMLElement) {
                                    cell.appendChild(cellValue);
                                } else {
                                    cell.textContent = cellValue;
                                }
                                dataRow.appendChild(cell);
                            });
                            table.appendChild(dataRow);
                        };

                        createDataRow([link, valueSpan, earliestTime, latestTime]);
                    }
                });
            });
        });

        return table;
    }
});