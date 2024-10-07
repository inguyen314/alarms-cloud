document.addEventListener('DOMContentLoaded', async function () {
    // Display the loading indicator
    const loadingIndicator = document.getElementById('loading_alarm_water_quality');
    loadingIndicator.style.display = 'block';

    let category = "Alarm-Water-Quality";

    const apiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/location/group?office=${office}&include-assigned=false&location-category-like=${category}`;
    console.log("apiUrl: ", apiUrl);

    const tsidTempWaterMap = new Map();
    const tsidTempAirMap = new Map();
    const metadataMap = new Map();
    const tsidDepthMap = new Map();

    const metadataPromises = [];
    const tempWaterTsidPromises = [];
    const tempAirTsidPromises = [];
    const depthTsidPromises = [];

    // Get current date and time
    const currentDateTime = new Date();
    // console.log('currentDateTime:', currentDateTime);

    // Subtract thirty hours from current date and time
    const currentDateTimeMinus30Hours = subtractHoursFromDate(currentDateTime, 2);
    // console.log('currentDateTimeMinus30Hours :', currentDateTimeMinus30Hours);

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
                        .then(firstData => {
                            console.log('firstData:', firstData);

                            if (!firstData) {
                                console.log(`No data for basin: ${basin}`);
                                return;
                            }

                            firstData[`assigned-locations`] = firstData[`assigned-locations`].filter(location => location.attribute <= 900);
                            firstData[`assigned-locations`].sort((a, b) => a.attribute - b.attribute);
                            combinedData.push(firstData);

                            if (firstData['assigned-locations']) {
                                firstData['assigned-locations'].forEach(loc => {

                                    console.log(loc['location-id']);

                                    let tsidTempWaterApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries/group/Temp-Water?office=${office}&category-id=${loc['location-id']}`;
                                    if (tsidTempWaterApiUrl) {
                                        tempWaterTsidPromises.push(
                                            fetch(tsidTempWaterApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        return null; // Skip processing if no data is found
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(tsidTempWaterData => {
                                                    console.log('tsidTempWaterData:', tsidTempWaterData);

                                                    if (tsidTempWaterData) {
                                                        tsidTempWaterMap.set(loc['location-id'], tsidTempWaterData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${tsidTempWaterApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    let tsidDepthApiUrl = `https://coe-${office.toLowerCase()}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries/group/Depth?office=${office}&category-id=${loc['location-id']}`;
                                    if (tsidDepthApiUrl) {
                                        depthTsidPromises.push(
                                            fetch(tsidDepthApiUrl)
                                                .then(response => {
                                                    if (response.status === 404) {
                                                        return null; // Skip processing if no data is found
                                                    }
                                                    if (!response.ok) {
                                                        throw new Error(`Network response was not ok: ${response.statusText}`);
                                                    }
                                                    return response.json();
                                                })
                                                .then(tsidDepthData => {
                                                    console.log('tsidDepthData:', tsidDepthData);

                                                    if (tsidDepthData) {
                                                        tsidDepthMap.set(loc['location-id'], tsidDepthData);
                                                    }
                                                })
                                                .catch(error => {
                                                    console.error(`Problem with the fetch operation for stage TSID data at ${tsidDepthApiUrl}:`, error);
                                                })
                                        );
                                    }

                                    if ("metadata" === "metadata") {
                                        // Construct the URL for the location metadata request
                                        let locApiUrl = `https://coe-${office.toLocaleLowerCase()}uwa04${office.toLocaleLowerCase()}.${office.toLocaleLowerCase()}.usace.army.mil:8243/${office.toLocaleLowerCase()}-data/locations/${loc['location-id']}?office=${office}`;
                                        if (locApiUrl) {
                                            // Push the fetch promise to the metadataPromises array
                                            metadataPromises.push(
                                                fetch(locApiUrl)
                                                    .then(response => {
                                                        if (response.status === 404) {
                                                            console.warn(`Location metadata not found for location: ${loc['location-id']}`);
                                                            return null; // Skip processing if no metadata is found
                                                        }
                                                        if (!response.ok) {
                                                            throw new Error(`Network response was not ok: ${response.statusText}`);
                                                        }
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
                                        }
                                    }
                                });
                            }
                        })
                        .catch(error => {
                            console.error(`Problem with the fetch operation for basin ${basin}:`, error);
                        })
                );
            });

            Promise.all(apiPromises)
                .then(() => Promise.all(tempWaterTsidPromises))
                .then(() => Promise.all(depthTsidPromises))
                .then(() => {
                    combinedData.forEach(basinData => {
                        if (basinData['assigned-locations']) {
                            basinData['assigned-locations'].forEach(loc => {
                                const tsidTempWaterMapData = tsidTempWaterMap.get(loc['location-id']);
                                console.log('tsidTempWaterMapData:', tsidTempWaterMapData);
                                if (tsidTempWaterMapData) {
                                    reorderByAttribute(tsidTempWaterMapData);
                                    loc['tsid-temp-water'] = tsidTempWaterMapData;
                                }

                                const tsidDepthMapData = tsidDepthMap.get(loc['location-id']);
                                console.log('tsidDepthMapData:', tsidDepthMapData);
                                if (tsidDepthMapData) {
                                    loc['tsid-depth'] = tsidDepthMapData;
                                }

                                const metadataMapData = metadataMap.get(loc['location-id']);
                                if (metadataMapData) {
                                    loc['metadata'] = metadataMapData;
                                }
                            });
                        }
                    });

                    console.log('combinedData:', combinedData);

                    // Assuming combinedData is an array of arrays
                    const additionalPromises = [];

                    // Iterate over all arrays in combinedData
                    for (const dataArray of combinedData) {
                        for (const locData of dataArray['assigned-locations'] || []) {
                            // Handle temperature time series
                            const tempTimeSeries = locData['tsid-temp-water']?.['assigned-time-series'] || [];
                            const depthTimeSeries = locData['tsid-depth']?.['assigned-time-series'] || [];

                            // Function to create fetch promises
                            const createFetchPromises = (timeSeries, type) => {
                                return timeSeries.map((series, index) => {
                                    const tsid = series['timeseries-id'];
                                    const apiUrl = `https://coe-${office}uwa04${office.toLowerCase()}.${office.toLowerCase()}.usace.army.mil:8243/${office.toLowerCase()}-data/timeseries?name=${tsid}&begin=${currentDateTimeMinus30Hours.toISOString()}&end=${currentDateTime.toISOString()}&office=${office}`;

                                    return fetch(apiUrl, {
                                        method: 'GET',
                                        headers: {
                                            'Accept': 'application/json;version=2'
                                        }
                                    }).then(res => res.json())
                                        .then(data => {
                                            // console.log(`Data for ${type} TSID ${tsid}:`, data);

                                            if (data.values) {
                                                data.values.forEach(entry => {
                                                    entry[0] = formatNWSDate(entry[0]);
                                                });
                                            }

                                            // Store the fetched data on locData
                                            locData[`${type}tsid-${index + 1}-api-data`] = data; // e.g., tsid1Data, tsid2Data, etc.
                                            locData[`${type}tsid-${index + 1}-last-value`] = getLastNonNullValue(data);
                                            // console.log(`${type}tsid${index + 1}-last-value:`, locData[`${type}tsid${index + 1}LastValue`]);
                                        })
                                        .catch(error => {
                                            console.error(`Error fetching additional data for location ${locData['location-id']} with TSID ${tsid}:`, error);
                                        });
                                });
                            };

                            // Create promises for temperature and depth time series
                            const tempPromises = createFetchPromises(tempTimeSeries, 'temp-water-');
                            const depthPromises = createFetchPromises(depthTimeSeries, 'depth-');

                            // Push all promises for this location into additionalPromises
                            additionalPromises.push(Promise.all([...tempPromises, ...depthPromises]));
                        }
                    }

                    // Wait for all additional data fetches to complete
                    return Promise.all(additionalPromises);
                })
                .then(() => {
                    console.log('All data fetched successfully:', combinedData);

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

        function filterByLocationCategory(array, category) {
            return array.filter(item =>
                item['location-category'] &&
                item['location-category']['office-id'] === category['office-id'] &&
                item['location-category']['id'] === category['id']
            );
        }
        
        // Function to get current data time
        function subtractHoursFromDate(date, hoursToSubtract) {
            return new Date(date.getTime() - (hoursToSubtract * 60 * 60 * 1000));
        }
        
        // Function to convert timestamp to specified format
        function formatNWSDate(timestamp) {
            const date = new Date(timestamp);
            const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month
            const dd = String(date.getDate()).padStart(2, '0'); // Day
            const yyyy = date.getFullYear(); // Year
            const hh = String(date.getHours()).padStart(2, '0'); // Hours
            const min = String(date.getMinutes()).padStart(2, '0'); // Minutes
            return `${mm}-${dd}-${yyyy} ${hh}:${min}`;
        }
        
        // Function to reorder based on attribute
        const reorderByAttribute = (data) => {
            data['assigned-time-series'].sort((a, b) => a.attribute - b.attribute);
        };
        
        // Function to format time to get 6am
        const formatTime = (date) => {
            const pad = (num) => (num < 10 ? '0' + num : num);
            return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };
        
        // Function to get 6am, 5am and 7am
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
        
        // Function to extract the am value for table
        function getValidValue(values) {
            // Get the first non-null value from the values array
            const validValue = values.find(valueEntry => valueEntry.value !== null);
            return validValue ? (validValue.value).toFixed(1) : 'N/A';
        }
        
        // Function to get the last non null value from values array
        function getLastNonNullValue(data) {
            // Iterate over the values array in reverse
            for (let i = data.values.length - 1; i >= 0; i--) {
                // Check if the value at index i is not null
                if (data.values[i][1] !== null) {
                    // Return the non-null value as separate variables
                    return {
                        timestamp: data.values[i][0],
                        value: data.values[i][1],
                        qualityCode: data.values[i][2]
                    };
                }
            }
            // If no non-null value is found, return null
            return null;
        }
        
        function createTable(data) {
            // Define the custom order for item.id
            const customOrder = ['Illinois', 'Salt']; // Adjust this to your desired order
        
            // Sort the data based on the custom order
            data.sort((a, b) => {
                return customOrder.indexOf(a.id) - customOrder.indexOf(b.id);
            });
        
            // Create a table element and assign it an ID
            const table = document.createElement('table');
            table.id = 'customers'; // Assigning the ID of "customers"
        
            // Loop through the data
            data.forEach(item => {
                // Create a header row
                const headerRow = document.createElement('tr');
        
                // Create a header cell for item.id with colSpan = 3
                const idHeader = document.createElement('th');
                idHeader.colSpan = 3; // Colspan of 3
                // Apply styles
                idHeader.style.backgroundColor = 'darkblue';
                idHeader.style.color = 'lightgray';
        
                // Create a link for item.id
                const link = document.createElement('a');
                const url = `https://wm.mvs.ds.usace.army.mil/district_templates/chart/index.html?basin=Mississippi&office=MVS&cwms_ts_id=${item.id}`;
                link.href = url;
                link.textContent = item.id;
                link.target = '_blank'; // Open link in a new tab
                link.style.color = 'white'; // Ensure text is readable
                idHeader.appendChild(link);
                
                headerRow.appendChild(idHeader);
                
                // Append the header row to the table
                table.appendChild(headerRow);
        
                // Create a sub-header row for the actual column headers
                const subHeaderRow = document.createElement('tr');
                const headers = ['Time Series', 'Value', 'Date Time'];
                headers.forEach(headerText => {
                    const td = document.createElement('td'); // Create a <td> element
                    td.textContent = headerText;
                    subHeaderRow.appendChild(td);
                });
                table.appendChild(subHeaderRow);
        
                // Loop through assigned locations
                item['assigned-locations'].forEach(location => {
                    // Loop through all keys in location to find last-values
                    Object.keys(location).forEach(key => {
                        if (key.endsWith('-last-value')) {
                            const lastValue = location[key];
                            const apiKey = key.replace('-last-value', '-api-data');
                            const apiData = location[apiKey];
        
                            // Create a new table row
                            const lastValueRow = document.createElement('tr');
                            
                            // Check if lastValue is not null
                            if (lastValue) {
                                // lastValueRow.innerHTML = `
                                //     <td>${apiData.name}</td>
                                //     <td>${lastValue.value !== null ? lastValue.value.toFixed(2) : 'Outage'}</td>
                                //     <td>${lastValue.timestamp}</td>
                                // `;
                            } else {
                                // Add row for null last value
                                lastValueRow.innerHTML = `
                                    <td>${apiData.name}</td>
                                    <td class="blinking-text">Outage</td>
                                    <td class="blinking-text">Outage</td>
                                `;
                            }
                            table.appendChild(lastValueRow);
                        }
                    });
                });
            });
        
            // Return the constructed table
            return table;
        }
});